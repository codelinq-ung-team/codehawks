"""Offline admission and API checks; no AWS calls or paid inference."""
import copy
import os
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

import boto3
from botocore.exceptions import ClientError, ReadTimeoutError
from botocore.stub import Stubber

from backend import rate_limit
from backend.app import app
from backend.tests.test_chat import MESSAGES, Stream, delta, reply, stop


def conflict():
    return ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "PutItem")


class Table:
    """Model atomic DynamoDB conditions and force competing initial reads."""
    def __init__(self, readers=0):
        self.item = None
        self.lock = threading.Lock()
        self.barrier = threading.Barrier(readers) if readers else None
        self.readers_left = readers
        self.writes = 0

    def get_item(self, **kwargs):
        assert kwargs["ConsistentRead"] is True
        with self.lock:
            result = {"Item": copy.deepcopy(self.item)} if self.item else {}
            wait = self.readers_left > 0
            if wait:
                self.readers_left -= 1
        if wait:
            self.barrier.wait(timeout=5)
        return result

    def put_item(self, **kwargs):
        with self.lock:
            if kwargs["ConditionExpression"] == "attribute_not_exists(#id)":
                matches = self.item is None
            else:
                matches = self.item is not None and self.item["revision"] == kwargs["ExpressionAttributeValues"][":previous"]
            if not matches:
                raise conflict()
            self.item = copy.deepcopy(kwargs["Item"])
            self.writes += 1


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.table = Table()
        self.client_factory = rate_limit.get_client.__wrapped__
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, {"CHAT_RATE_LIMIT_TABLE": "test-table"}).start()
        patch("backend.rate_limit.get_client", return_value=self.table).start()
        self.clock = patch("backend.rate_limit.time.time", return_value=100).start()

    def assert_error(self, status):
        with self.assertRaises(rate_limit.AdmissionError) as caught:
            rate_limit.admit()
        self.assertEqual(caught.exception.status, status)
        self.assertNotIn("secret", caught.exception.message)

    def test_two_admissions_then_reject_and_expire_individually(self):
        rate_limit.admit()
        self.clock.return_value = 110
        rate_limit.admit()
        self.clock.return_value = 159.999
        self.assert_error(429)
        self.clock.return_value = 160
        rate_limit.admit()
        self.assertEqual(self.table.item["admissions"]["L"], [{"N": "110"}, {"N": "160"}])
        self.assert_error(429)
        self.clock.return_value = 170
        rate_limit.admit()

    def test_clock_minute_boundary_does_not_reset_allowance(self):
        self.clock.return_value = 59
        rate_limit.admit()
        self.clock.return_value = 59.5
        rate_limit.admit()
        self.clock.return_value = 60
        self.assert_error(429)

    def test_parallel_instances_admit_only_two(self):
        table = Table(readers=8)
        def attempt(_):
            try:
                rate_limit.admit()
                return 200
            except rate_limit.AdmissionError as error:
                return error.status
        with patch("backend.rate_limit.get_client", return_value=table):
            with ThreadPoolExecutor(max_workers=8) as pool:
                results = list(pool.map(attempt, range(8)))
        self.assertEqual(results.count(200), 2)
        self.assertEqual(results.count(429), 6)
        self.assertEqual(table.writes, 2)

    def test_conflict_retries_are_bounded(self):
        client = Mock()
        client.get_item.return_value = {}
        client.put_item.side_effect = conflict()
        with patch("backend.rate_limit.get_client", return_value=client):
            self.assert_error(503)
        self.assertEqual(client.put_item.call_count, 4)

    def test_storage_failures_are_sanitized_and_not_retried(self):
        for operation in ("get_item", "put_item"):
            for error in (ClientError({"Error": {"Code": "AccessDeniedException", "Message": "secret"}}, operation),
                          ReadTimeoutError(endpoint_url="secret")):
                with self.subTest(operation=operation, error=type(error).__name__):
                    client = Mock()
                    client.get_item.return_value = {}
                    getattr(client, operation).side_effect = error
                    with patch("backend.rate_limit.get_client", return_value=client):
                        self.assert_error(503)
                    self.assertEqual(client.get_item.call_count, 1)
                    self.assertLessEqual(client.put_item.call_count, 1)

    def test_missing_configuration_only_bypasses_outside_lambda(self):
        with patch.dict(os.environ, {}, clear=True), patch("backend.rate_limit.get_client") as client:
            rate_limit.admit()
            client.assert_not_called()
        with patch.dict(os.environ, {"AWS_LAMBDA_FUNCTION_NAME": "chat", "CHAT_RATE_LIMIT_TABLE": ""}, clear=True):
            self.assert_error(503)

    def test_ambiguous_successful_write_consumes_allowance_without_retry(self):
        real_write = self.table.put_item
        def write_then_timeout(**kwargs):
            real_write(**kwargs)
            raise ReadTimeoutError(endpoint_url="secret")
        with patch.object(self.table, "put_item", side_effect=write_then_timeout) as write:
            self.assert_error(503)
            write.assert_called_once()
        self.assertEqual(self.table.writes, 1)
        rate_limit.admit()
        self.assert_error(429)

    def test_sdk_disables_automatic_write_retries(self):
        # Exercise the real factory, without constructing a network client.
        with patch("backend.rate_limit.boto3.client") as client:
            self.client_factory()
        self.assertEqual(client.call_args.args, ("dynamodb",))
        self.assertEqual(client.call_args.kwargs["config"].retries["total_max_attempts"], 1)

    def test_malformed_state_and_backward_clock_fail_closed(self):
        for item in ({}, {"revision": {"S": "r"}, "admissions": {"L": [{"N": "NaN"}]}},
                     {"revision": {"S": "r"}, "admissions": {"L": [{"N": "-1"}]}}):
            with self.subTest(item=item), patch("backend.rate_limit.get_client") as get_client:
                get_client.return_value.get_item.return_value = {"Item": item}
                self.assert_error(503)
        rate_limit.admit()
        rate_limit.admit()
        self.clock.return_value = 90
        self.assert_error(429)

    def test_sdk_conditional_write_contract(self):
        client = boto3.client("dynamodb", region_name="us-east-1", aws_access_key_id="offline",
                              aws_secret_access_key="offline")
        with Stubber(client) as stub, patch("backend.rate_limit.get_client", return_value=client), \
                patch("backend.rate_limit.uuid4") as new_revision:
            new_revision.return_value.hex = "new"
            for existing, condition, names, values in (
                (None, "attribute_not_exists(#id)", {"#id": "id"}, {}),
                ({"revision": {"S": "old"}, "admissions": {"L": [{"N": "100"}]}},
                 "#revision = :previous", {"#revision": "revision"},
                 {"ExpressionAttributeValues": {":previous": {"S": "old"}}}),
            ):
                stub.add_response("get_item", {"Item": existing} if existing else {},
                                  {"TableName": "test-table", "Key": rate_limit.KEY, "ConsistentRead": True})
                stamps = [{"N": "100"}] * (2 if existing else 1)
                stub.add_response("put_item", {}, {
                    "TableName": "test-table", "Item": {**rate_limit.KEY, "revision": {"S": "new"},
                                                          "admissions": {"L": stamps}},
                    "ConditionExpression": condition, "ExpressionAttributeNames": names, **values,
                })
                rate_limit.admit()
            stub.assert_no_pending_responses()


class LimitedApiTests(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        self.table = Table()
        self.aws = Mock()
        self.aws.converse.return_value = reply()
        self.aws.converse_stream.side_effect = lambda **_: {"stream": Stream([delta("Hello"), stop()])}
        patch.dict(os.environ, {"MODEL_ID": "test-model", "CHAT_RATE_LIMIT_TABLE": "test-table",
                               "AWS_LAMBDA_FUNCTION_NAME": "chat"}).start()
        patch("backend.rate_limit.get_client", return_value=self.table).start()
        patch("backend.rate_limit.time.time", return_value=100).start()
        patch("backend.llm.get_client", return_value=self.aws).start()
        self.http = app.test_client()

    def post(self, stream):
        return self.http.post("/api/chat", json={"messages": MESSAGES, "stream": stream})

    def test_buffered_and_streaming_share_allowance_once_per_call(self):
        self.assertEqual(self.post(False).status_code, 200)
        streamed = self.post(True)
        self.assertEqual(streamed.status_code, 200)
        self.assertIn(b'"done": true', streamed.data)
        for mode in (False, True):
            response = self.post(mode)
            self.assertEqual(response.status_code, 429)
            self.assertTrue(response.is_json)
            self.assertIn("error", response.json)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(self.table.writes, 2)
        self.aws.converse.assert_called_once()
        self.aws.converse_stream.assert_called_once()

    def test_invalid_input_health_and_missing_model_do_not_consume_allowance(self):
        for path in ("/health", "/api/health"):
            self.assertEqual(self.http.get(path).status_code, 200)
        for stream in (False, True):
            self.assertEqual(self.http.post("/api/chat", json={"messages": [], "stream": stream}).status_code, 400)
            with patch.dict(os.environ, {"MODEL_ID": ""}):
                self.assertEqual(self.post(stream).status_code, 503)
        self.assertIsNone(self.table.item)
        self.aws.converse.assert_not_called()
        self.aws.converse_stream.assert_not_called()

    def test_limiter_failure_blocks_both_modes_before_stream_headers(self):
        for mode in (False, True):
            with patch("backend.rate_limit.get_client") as client:
                client.return_value.get_item.side_effect = ReadTimeoutError(endpoint_url="secret")
                response = self.post(mode)
            self.assertEqual(response.status_code, 503)
            self.assertTrue(response.is_json)
            self.assertNotIn(b"secret", response.data)
        self.aws.converse.assert_not_called()
        self.aws.converse_stream.assert_not_called()

    def test_failed_inference_retains_admission(self):
        self.aws.converse.side_effect = ClientError({"Error": {"Code": "AccessDeniedException"}}, "Converse")
        self.assertEqual(self.post(False).status_code, 502)
        self.assertEqual(self.post(True).status_code, 200)
        self.assertEqual(self.post(False).status_code, 429)
        self.assertEqual(self.table.writes, 2)


if __name__ == "__main__":
    unittest.main()
