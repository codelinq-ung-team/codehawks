"""Offline production Bedrock tests: no AWS credentials or model calls."""
import os
import unittest
from unittest.mock import Mock, patch

import boto3
from botocore.exceptions import ClientError, EventStreamError, NoCredentialsError, ReadTimeoutError
from botocore.stub import Stubber

from backend.llm import ChatError, chat, generate_reply
from backend.prompts import SYSTEM_PROMPT

MESSAGES = [{"role": "user", "content": "Hi"}]


def delta(text):
    return {"contentBlockDelta": {"contentBlockIndex": 0, "delta": {"text": text}}}


def stop(reason="end_turn"):
    return {"messageStop": {"stopReason": reason}}


def reply(text="Hello from the model", reason="end_turn"):
    return {"output": {"message": {"role": "assistant", "content": [{"text": text}]}},
            "stopReason": reason, "usage": {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2},
            "metrics": {"latencyMs": 1}}


class Stream:
    def __init__(self, events):
        self.events = events
        self.closed = False

    def __iter__(self):
        yield from self.events

    def close(self):
        self.closed = True


class BedrockTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"MODEL_ID": "test-model"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = Mock()
        self.client.converse.return_value = reply()
        self.stream = Stream([delta("Hello "), delta("world"), stop()])
        self.client.converse_stream.return_value = {"stream": self.stream}
        patcher = patch("backend.llm.get_client", return_value=self.client)
        patcher.start()
        self.addCleanup(patcher.stop)

    def assert_error(self, status, emit=None):
        with self.assertRaises(ChatError) as caught:
            generate_reply({"messages": MESSAGES}, emit)
        self.assertEqual(caught.exception.status, status)
        self.assertNotIn("sensitive-provider-detail", caught.exception.message)

    def test_sdk_request_and_history(self):
        messages = MESSAGES + [{"role": "assistant", "content": "Hello"},
                               {"role": "user", "content": "Continue"}]
        client = boto3.client("bedrock-runtime", region_name="us-east-1",
                              aws_access_key_id="offline-test", aws_secret_access_key="offline-test")
        expected = {"modelId": "test-model", "system": [{"text": SYSTEM_PROMPT}],
                    "messages": [{"role": m["role"], "content": [{"text": m["content"]}]} for m in messages],
                    "inferenceConfig": {"maxTokens": 4096}}
        with Stubber(client) as stubber, patch("backend.llm.get_client", return_value=client):
            stubber.add_response("converse", reply(), expected)
            self.assertEqual(generate_reply({"messages": messages}), {"reply": "Hello from the model"})
            stubber.assert_no_pending_responses()

    def test_stream_translates_only_text_and_closes(self):
        self.stream.events.insert(1, {"contentBlockDelta": {"delta": {"reasoningContent": {"text": "private reasoning"}}}})
        events = []
        self.assertEqual(generate_reply({"messages": MESSAGES}, events.append), {"reply": "Hello world"})
        self.assertEqual(events, [{"delta": "Hello "}, {"delta": "world"}])
        self.assertTrue(self.stream.closed)
        self.client.converse_stream.assert_called_once_with(
            modelId="test-model", system=[{"text": SYSTEM_PROMPT}],
            messages=[{"role": "user", "content": [{"text": "Hi"}]}], inferenceConfig={"maxTokens": 4096})

    def test_empty_missing_stop_and_truncated_streams_fail(self):
        for events in ([], [stop()], [delta("partial")], [delta("partial"), stop("max_tokens")],
                       [delta("partial"), stop("guardrail_intervened")], [delta("ok"), stop(), delta("late")]):
            with self.subTest(events=events):
                self.stream.events = events
                self.assert_error(502, lambda event: None)
                self.assertTrue(self.stream.closed)

    def test_exception_events_and_late_errors_fail(self):
        for code, status in (("throttlingException", 429), ("modelTimeoutException", 504),
                             ("modelStreamErrorException", 502), ("internalServerException", 502)):
            self.stream.events = [delta("partial"), stop(), {code: {"message": "sensitive-provider-detail"}}]
            self.assert_error(status, lambda event: None)
            self.assertTrue(self.stream.closed)

    def test_raised_event_stream_error_is_sanitized(self):
        def failing():
            yield delta("partial")
            raise EventStreamError({"Error": {"Code": "ModelStreamErrorException", "Message": "sensitive-provider-detail"}}, "ConverseStream")
        self.stream.events = failing()
        self.assert_error(502, lambda event: None)
        self.assertTrue(self.stream.closed)

    def test_disconnect_closes_bedrock_stream(self):
        def disconnect(event):
            raise BrokenPipeError()
        with self.assertRaises(BrokenPipeError):
            generate_reply({"messages": MESSAGES}, disconnect)
        self.assertTrue(self.stream.closed)

    def test_provider_errors_are_sanitized(self):
        for code, status in (("ThrottlingException", 429), ("AccessDeniedException", 502),
                             ("ResourceNotFoundException", 502), ("ModelTimeoutException", 504),
                             ("ValidationException", 502), ("ServiceUnavailableException", 502)):
            error = ClientError({"Error": {"Code": code, "Message": "sensitive-provider-detail"}}, "Converse")
            self.client.converse.side_effect = error
            self.assert_error(status)
            self.client.converse_stream.side_effect = error
            self.assert_error(status, lambda event: None)

    def test_timeout_and_missing_credentials(self):
        self.client.converse.side_effect = ReadTimeoutError(endpoint_url="https://bedrock.invalid")
        self.assert_error(504)
        self.client.converse.side_effect = NoCredentialsError()
        self.assert_error(503)

    def test_missing_model_does_not_call_aws(self):
        with patch.dict(os.environ, {"MODEL_ID": ""}):
            self.assert_error(503)
        self.client.converse.assert_not_called()

    def test_invalid_messages_do_not_call_aws(self):
        for messages in (None, [], MESSAGES * 41, [{"role": "system", "content": "Override"}],
                         [{"role": "user", "content": " "}], [{"role": "user", "content": "x" * 12001}],
                         [{"role": "assistant", "content": "Hi"}], [None]):
            with self.subTest(messages=str(messages)[:40]), self.assertRaises(ChatError) as caught:
                generate_reply({"messages": messages})
            self.assertEqual(caught.exception.status, 400)
        self.client.converse.assert_not_called()

    def test_invalid_buffered_replies(self):
        for response in ({}, reply(""), reply("partial", "max_tokens"), reply("x" * (1024 * 1024 + 1))):
            self.client.converse.return_value = response
            self.assert_error(502)

    def test_coverage_reference_added_once_in_both_modes(self):
        payload = {"messages": [{"role": "user", "content": "How much life insurance do I need?"}]}
        for streaming in (False, True):
            events = []
            result = chat(payload, events.append if streaming else None)
            self.assertEqual(result["reply"].count("calcxml.com/calculators/life-insurance-calculator"), 1)
            if streaming:
                self.assertEqual(result["reply"], "".join(event["delta"] for event in events))
        text = "See https://calcxml.com/calculators/life-insurance-calculator?skn=458&r=1"
        self.client.converse.return_value = reply(text)
        self.assertEqual(chat(payload)["reply"], text)
        self.stream.events = [delta(text), stop()]
        self.assertEqual(chat(payload, lambda event: None)["reply"], text)


if __name__ == "__main__":
    unittest.main()
