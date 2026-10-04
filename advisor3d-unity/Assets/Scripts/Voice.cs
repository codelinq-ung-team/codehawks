// Talking with Abe. The headset's microphone goes to OpenAI's Realtime API over a WebSocket and
// Abe's voice comes back the same way, so the user can simply talk and listen. The site's
// backend hands out a short-lived secret for the connection (Backend.VoiceSession); the API key,
// the model, the voice and Abe's instructions stay on the server.
//
// The app stays in charge of the assessment. The model reports each answer by calling
// record_answer; VoiceScript puts it through the chat script's checks, saves it, and tells the
// model what to say next. What was said, by either side, lands in the chat log.
using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using Debug = UnityEngine.Debug;

namespace Advisor3D
{
    public static class Voice
    {
        const int RATE = 24000;           // mono 16-bit samples a second, both ways
        const float MAX_SECONDS = 600;    // a session left open costs money, so it ends by itself
        // The headset has no echo cancellation, so while Abe speaks (and for a moment after) the
        // microphone is not passed on: he would hear himself and answer his own questions. You can
        // still talk over him. The app listens for a voice clearly louder than his own coming back
        // through the microphone, and when it hears one it stops him and passes on what you said.
        const double TAIL_SECONDS = 0.6;
        const float FLOOR = 0.045f;        // quieter than this is never taken for the user talking over him
        const float OVER = 2.6f;           // how many times louder than Abe's own echo the user must be
        const float SUSTAIN = 0.28f;       // for this long, so a cough or a click does not stop him
        const float LEARN = 1.2f;          // at the start of each thing Abe says, how long his echo is measured
        const int PREROLL = 6;             // chunks kept (about a tenth of a second each) so the start of what you said is not lost
        const string DROPPED = "Abe’s voice dropped. You can keep going by tapping or typing.";
        const string UNAVAILABLE = "Abe’s voice isn’t available right now. You can keep going by tapping or typing.";

        public static string Status { get; private set; } = "off"; // off | connecting | on
        public static string Error { get; private set; } = "";
        public static int Version { get; private set; }            // goes up whenever the screen should redraw
        public static bool On => Status == "on";
        public static bool Speaking { get; private set; }
        public static float Level => Speaking ? level : 0;         // 0..1, how loud Abe is right now
        public static string Caption { get; private set; } = "";   // what Abe is saying right now, as it arrives
        public static bool Hearing { get; private set; }           // the user is talking, or just was and it is being written down

        // One connection. A new one is made for every session, so late events from an old one are never read.
        class Link
        {
            public readonly ClientWebSocket socket = new ClientWebSocket();
            public readonly CancellationTokenSource cancel = new CancellationTokenSource();
            public readonly ConcurrentQueue<string> inbox = new ConcurrentQueue<string>();
            public readonly ConcurrentQueue<string> outbox = new ConcurrentQueue<string>();
            public readonly SemaphoreSlim waiting = new SemaphoreSlim(0);
            public volatile bool closed;

            public void Close()
            {
                closed = true;
                try { cancel.Cancel(); socket.Abort(); } catch (Exception) { /* already gone */ }
            }
        }

        static Link link;
        static int run;          // which Start() this is; an older one that is still connecting gives up
        static float elapsed, quiet;
        static bool responding;  // the model is partway through a reply
        static bool wrapUp;      // Abe has said the closing words; hang up once he is quiet

        static float echo;                 // how loud Abe's own voice is at the microphone (RMS), learned as he talks
        static float spoken, over;         // seconds of the current utterance so far, and seconds the user has been louder than him
        static float waiting = -1;         // after stopping Abe: seconds left for the server to hear someone, or he is asked to go on
        static readonly Queue<byte[]> preroll = new Queue<byte[]>();

        static string micDevice;
        static AudioClip micClip;
        static int micRead;

        static AudioSource speaker;
        static readonly object gate = new object();
        static readonly Queue<float[]> playing = new Queue<float[]>();
        static int playHead;     // samples already played from the first chunk
        static int queued;       // samples waiting to be played
        static volatile float level;
        static long lastSound = long.MinValue / 2; // Stopwatch ticks when Abe's audio was last playing
        static readonly Stopwatch clock = Stopwatch.StartNew();

        static void Set(string status, string error = "")
        {
            Status = status;
            Error = error;
            Version++;
        }

        // ---------- starting and stopping ----------
        public static void Start()
        {
            if (Status != "off" || !Application.isPlaying) return;
            Set("connecting");
            App.I.StartCoroutine(Begin(++run));
        }

        public static void Stop() => Stop("");

        static void Stop(string error)
        {
            run++;
            link?.Close();
            link = null;
            if (micClip) { Microphone.End(micDevice); micClip = null; }
            if (speaker) speaker.Stop();
            lock (gate) { playing.Clear(); playHead = 0; queued = 0; }
            level = 0;
            Speaking = responding = wrapUp = Hearing = false;
            Caption = "";
            echo = spoken = over = 0;
            waiting = -1;
            preroll.Clear();
            if (Status != "off" || error != Error) Set("off", error);
        }

        static IEnumerator Begin(int id)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!UnityEngine.Android.Permission.HasUserAuthorizedPermission(UnityEngine.Android.Permission.Microphone))
            {
                var answered = false;
                var callbacks = new UnityEngine.Android.PermissionCallbacks();
                callbacks.PermissionGranted += _ => answered = true;
                callbacks.PermissionDenied += _ => answered = true;
                UnityEngine.Android.Permission.RequestUserPermission(UnityEngine.Android.Permission.Microphone, callbacks);
                while (!answered && id == run) yield return null;
                if (id != run) yield break;
                if (!UnityEngine.Android.Permission.HasUserAuthorizedPermission(UnityEngine.Android.Permission.Microphone))
                {
                    Stop("The microphone is blocked. Allow it for this app in the headset’s settings, then try again.");
                    yield break;
                }
            }
#endif
            if (Microphone.devices.Length == 0) { Stop("No microphone was found. You can keep going by tapping or typing."); yield break; }

            JObject session = null;
            var asked = false;
            Backend.VoiceSession(json => { session = json; asked = true; });
            while (!asked && id == run) yield return null;
            if (id != run) yield break;
            var secret = (string)session?["clientSecret"];
            var url = (string)session?["url"];
            if (string.IsNullOrEmpty(secret) || string.IsNullOrEmpty(url)) { Stop(UNAVAILABLE); yield break; }

            var l = new Link();
            l.socket.Options.SetRequestHeader("Authorization", "Bearer " + secret);
            var connect = l.socket.ConnectAsync(new Uri(url), l.cancel.Token);
            while (!connect.IsCompleted && id == run) yield return null;
            if (id != run) { l.Close(); yield break; }
            if (connect.IsFaulted || connect.IsCanceled || l.socket.State != WebSocketState.Open)
            {
                Debug.LogWarning($"Abe’s voice could not connect: {connect.Exception?.GetBaseException().Message}");
                l.Close();
                Stop(UNAVAILABLE);
                yield break;
            }
            Task.Run(() => Receive(l));
            Task.Run(() => Deliver(l));

            link = l;
            elapsed = quiet = 0;
            StartMicrophone();
            StartSpeaker();
            Set("on");
            // Wait until the user has clearly finished before answering: people pause mid-sentence,
            // most of all when they are working out a number.
            Send(new JObject
            {
                ["type"] = "session.update",
                ["session"] = new JObject
                {
                    ["type"] = "realtime",
                    ["audio"] = new JObject { ["input"] = new JObject { ["turn_detection"] = new JObject { ["type"] = "semantic_vad", ["eagerness"] = "low" } } },
                },
            });
            Tell(VoiceScript.Briefing(Store.State));
        }

        // ---------- the connection (these two run off the main thread) ----------
        static async Task Receive(Link l)
        {
            var buffer = new byte[1 << 16];
            var message = new MemoryStream();
            try
            {
                while (l.socket.State == WebSocketState.Open)
                {
                    var part = await l.socket.ReceiveAsync(new ArraySegment<byte>(buffer), l.cancel.Token);
                    if (part.MessageType == WebSocketMessageType.Close) break;
                    message.Write(buffer, 0, part.Count);
                    if (!part.EndOfMessage) continue;
                    l.inbox.Enqueue(Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length));
                    message.SetLength(0);
                }
            }
            catch (Exception) { /* cancelled or cut off: either way the session is over */ }
            l.closed = true;
        }

        static async Task Deliver(Link l)
        {
            try
            {
                while (!l.closed)
                {
                    await l.waiting.WaitAsync(l.cancel.Token);
                    while (l.outbox.TryDequeue(out var text))
                    {
                        await l.socket.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(text)), WebSocketMessageType.Text, true, l.cancel.Token);
                    }
                }
            }
            catch (Exception) { /* as above */ }
            l.closed = true;
        }

        static void Send(JObject e)
        {
            var l = link;
            if (l == null || l.closed) return;
            l.outbox.Enqueue(e.ToString(Newtonsoft.Json.Formatting.None));
            l.waiting.Release();
        }

        // A message for the model in words (the app's own notes, or a tapped answer), then its reply.
        static void Tell(string text)
        {
            if (responding)
            {
                // Abe was mid-sentence: stop him so the new reply starts cleanly.
                Send(new JObject { ["type"] = "response.cancel" });
                lock (gate) { playing.Clear(); playHead = 0; queued = 0; }
            }
            Send(new JObject
            {
                ["type"] = "conversation.item.create",
                ["item"] = new JObject
                {
                    ["type"] = "message", ["role"] = "user",
                    ["content"] = new JArray { new JObject { ["type"] = "input_text", ["text"] = text } },
                },
            });
            Send(new JObject { ["type"] = "response.create" });
        }

        // A tapped suggestion or a typed answer while voice is on: Abe takes it as if it were spoken.
        public static void Say(string text)
        {
            if (!On) return;
            Store.Set(s => s.messages.Add(new Message { role = "user", text = text }));
            Tell(text);
        }

        // The user took an answer back on screen ("What Abe knows"), so a different question may be open.
        public static void Changed()
        {
            if (!On) return;
            wrapUp = false;
            Tell(VoiceScript.TakenBack(Store.State));
        }

        // ---------- every frame ----------
        public static void Tick(float dt)
        {
            if (Status != "on") return;
            var l = link;
            while (l.inbox.TryDequeue(out var text))
            {
                try { Handle(JObject.Parse(text)); }
                catch (Exception e) { Debug.LogWarning($"Abe’s voice sent something unexpected: {e.Message}"); }
                if (link != l) return; // an event ended the session
            }
            if (l.closed) { Stop(DROPPED); return; }

            elapsed += dt;
            if (elapsed > MAX_SECONDS) { Stop("Voice paused to save the session. Press Talk to Abe to carry on."); return; }

            bool sounding;
            lock (gate) sounding = queued > 0;
            var speaking = sounding || (clock.ElapsedTicks - Interlocked.Read(ref lastSound)) < TAIL_SECONDS * Stopwatch.Frequency;
            if (speaking != Speaking) { Speaking = speaking; Version++; }
            SendMicrophone();
            // Abe was stopped for a voice, but the server heard nobody (a noise, or his own echo): have him go on.
            if (waiting > 0 && (waiting -= dt) <= 0)
            {
                waiting = -1;
                if (!responding && !Hearing) Tell(VoiceScript.APP + "You stopped because of a noise, not the user. Briefly ask your last question again.");
            }

            // After the closing words, hang up so the microphone is not left open.
            quiet = wrapUp && !responding && !Speaking ? quiet + dt : 0;
            if (quiet > 1) Stop();
        }

        static void Handle(JObject e)
        {
            switch ((string)e["type"])
            {
                case "response.created":
                    responding = true;
                    if (Hearing) { Hearing = false; Version++; } // he is answering, so the user's turn is over
                    break;
                case "response.output_audio.delta":
                case "response.audio.delta":
                    Play(Convert.FromBase64String((string)e["delta"]));
                    break;
                case "response.output_audio_transcript.delta":
                case "response.audio_transcript.delta":
                    Caption += (string)e["delta"] ?? ""; // the chat screen polls this; a redraw per word is too much
                    break;
                case "response.output_audio_transcript.done":
                case "response.audio_transcript.done":
                    Caption = "";
                    AbeSaid(((string)e["transcript"] ?? "").Trim());
                    break;
                case "input_audio_buffer.speech_started":
                    waiting = -1;
                    Hearing = true;
                    Version++;
                    break;
                case "conversation.item.input_audio_transcription.completed":
                case "conversation.item.input_audio_transcription.failed":
                    Hearing = false;
                    var heard = ((string)e["transcript"] ?? "").Trim();
                    if (heard != "") Store.Set(s => s.messages.Add(new Message { role = "user", text = heard }));
                    else Version++;
                    break;
                case "response.done":
                    responding = false;
                    if (Caption != "")
                    {
                        // Cut off before his words were complete: the transcript shows how far he got.
                        var partial = Caption.Trim();
                        Caption = "";
                        if (partial != "") AbeSaid(partial + "…"); else Version++;
                    }
                    Finished(e["response"] as JObject);
                    break;
                case "error":
                    Debug.LogWarning($"Abe’s voice reported: {e["error"]?["code"]} {e["error"]?["message"]}");
                    break;
            }
        }

        // Abe's words go into the chat log, with the open question's suggestions to tap.
        static void AbeSaid(string text)
        {
            if (text == "") return;
            var s = Store.State;
            var step = Script.NextStep(s);
            var m = new Message { role = "bot", text = text };
            if (step == null) { m.done = true; wrapUp = true; }
            else if (s.pending != null) m.replies = new List<string> { "Yes, monthly", "No, yearly" };
            else m.replies = Script.Ask(step, s).replies;
            Store.Set(st => st.messages.Add(m));
        }

        // A reply is complete. Any answers it reported are checked and saved here, and the model is
        // told what to say next.
        static void Finished(JObject response)
        {
            if (response == null) return;
            if ((string)response["status"] == "failed")
            {
                Debug.LogWarning($"Abe’s voice failed: {response["status_details"]}");
                Stop(UNAVAILABLE);
                return;
            }
            var answered = false;
            foreach (var item in response["output"] as JArray ?? new JArray())
            {
                if ((string)item["type"] != "function_call" || (string)item["name"] != "record_answer") continue;
                JObject args;
                try { args = JObject.Parse((string)item["arguments"] ?? "{}"); }
                catch (Exception) { args = new JObject(); }
                Send(new JObject
                {
                    ["type"] = "conversation.item.create",
                    ["item"] = new JObject { ["type"] = "function_call_output", ["call_id"] = item["call_id"], ["output"] = Record(args) },
                });
                answered = true;
            }
            if (answered) Send(new JObject { ["type"] = "response.create" });
        }

        static string Record(JObject args)
        {
            static bool Number(JToken t) => t != null && (t.Type == JTokenType.Integer || t.Type == JTokenType.Float);
            var intent = (string)args["intent"];
            var reading = new Reading
            {
                intent = intent == "unsure" || intent == "skip" ? intent : "answer",
                value = Number(args["value"]) ? (long?)Math.Round((double)args["value"]) : null,
                household = args["household"]?.Type == JTokenType.String ? (string)args["household"] : null,
                period = (string)args["period"] == "month" || (string)args["period"] == "year" ? (string)args["period"] : null,
            };
            if (args["extra"] is JObject extra)
            {
                foreach (var kv in extra) if (Number(kv.Value)) reading.extra[kv.Key] = (long)Math.Round((double)kv.Value);
            }
            var heard = args["heard"]?.Type == JTokenType.String ? (string)args["heard"] : "";
            var open = Script.NextStep(Store.State);
            var (reply, tell) = VoiceScript.Record(reading, heard, Store.State);
            // Which question, how the model read it, and whether it was saved. Not the answer itself.
            Debug.Log($"Advisor3D: voice answer for {open ?? "nothing"}: {reading.intent}, {(reply?.updates != null ? "saved" : "not saved")}.");
            if (reply != null && (reply.updates != null || reply.pendingSet))
            {
                Store.Set(st =>
                {
                    if (reply.updates != null) foreach (var kv in reply.updates) st.profile[kv.Key] = kv.Value;
                    if (reply.pendingSet) st.pending = reply.pending;
                });
            }
            return tell;
        }

        // ---------- microphone ----------
        static void StartMicrophone()
        {
            micDevice = Microphone.devices[0];
            Microphone.GetDeviceCaps(micDevice, out var min, out var max);
            var rate = min == 0 && max == 0 ? RATE : Mathf.Clamp(RATE, min, max);
            micClip = Microphone.Start(micDevice, true, 10, rate);
            micRead = 0;
        }

        // Send what the microphone has picked up since last time, about ten times a second.
        static void SendMicrophone()
        {
            if (!micClip) return;
            var at = Microphone.GetPosition(micDevice);
            var count = at - micRead;
            if (count < 0) count += micClip.samples;
            if (count < micClip.frequency / 10) return;
            var channels = micClip.channels;
            var data = new float[count * channels]; // GetData fills the whole array, so it is sized to what is new
            micClip.GetData(data, micRead); // reads around the end of the looping clip
            micRead = at;
            // To mono 16-bit samples at RATE, whatever the microphone gave us.
            var n = (int)((long)count * RATE / micClip.frequency);
            var bytes = new byte[n * 2];
            for (var i = 0; i < n; i++)
            {
                var from = (float)i * (count - 1) / Mathf.Max(1, n - 1);
                var a = (int)from;
                var b = Mathf.Min(a + 1, count - 1);
                var v = Mathf.Lerp(data[a * channels], data[b * channels], from - a);
                var sample = (short)Mathf.Clamp(v * 32767f, short.MinValue, short.MaxValue);
                bytes[i * 2] = (byte)sample;
                bytes[i * 2 + 1] = (byte)(sample >> 8);
            }
            if (Speaking)
            {
                if (!TalkingOver(data, count, channels, (float)count / micClip.frequency))
                {
                    preroll.Enqueue(bytes);
                    while (preroll.Count > PREROLL) preroll.Dequeue();
                    return;
                }
                // You talked over him: pass on what was held back while deciding, so your first words are not lost.
                while (preroll.Count > 0) Append(preroll.Dequeue());
            }
            else preroll.Clear(); // only his own voice was in there
            Append(bytes);
        }

        static void Append(byte[] bytes) => Send(new JObject { ["type"] = "input_audio_buffer.append", ["audio"] = Convert.ToBase64String(bytes) });

        // While Abe is speaking: is the user talking over him? True once, at the moment Abe is stopped.
        static bool TalkingOver(float[] data, int count, int channels, float seconds)
        {
            var sum = 0f;
            for (var i = 0; i < count; i++) sum += data[i * channels] * data[i * channels];
            var loudness = Mathf.Sqrt(sum / Mathf.Max(1, count));

            bool sounding;
            lock (gate) sounding = queued > 0;
            if (!sounding) { spoken = over = 0; return false; } // the pause after he stops; nothing to talk over
            spoken += seconds;
            if (spoken <= LEARN)
            {
                // The first moments of each thing he says are taken as his voice alone.
                echo = Mathf.Max(echo * 0.97f, loudness);
                over = 0;
                return false;
            }
            over = loudness > Mathf.Max(FLOOR, echo * OVER) ? over + seconds : 0;
            if (over < SUSTAIN) return false;

            // Stop him: drop what he had left to say, and tell the server he was cut off.
            Debug.Log($"Advisor3D: the user talked over Abe (microphone {loudness:0.000}, his echo {echo:0.000}).");
            over = spoken = 0;
            lock (gate) { playing.Clear(); playHead = 0; queued = 0; }
            Interlocked.Exchange(ref lastSound, long.MinValue / 2);
            Speaking = false;
            Version++;
            if (responding) Send(new JObject { ["type"] = "response.cancel" });
            waiting = 3;
            return true;
        }

        // ---------- Abe's voice ----------
        static void StartSpeaker()
        {
            if (!speaker)
            {
                var go = new GameObject("Abe’s Voice");
                go.transform.SetParent(App.I.transform, false);
                speaker = go.AddComponent<AudioSource>();
                speaker.playOnAwake = false;
                speaker.spatialBlend = 0;
                speaker.loop = true;
                // A clip that never ends: Unity asks Fill for more samples as it plays.
                speaker.clip = AudioClip.Create("Abe", RATE, 1, RATE, true, Fill);
            }
            speaker.Play();
        }

        static void Play(byte[] pcm)
        {
            var chunk = new float[pcm.Length / 2];
            for (var i = 0; i < chunk.Length; i++) chunk[i] = (short)(pcm[i * 2] | (pcm[i * 2 + 1] << 8)) / 32768f;
            if (chunk.Length == 0) return;
            lock (gate) { playing.Enqueue(chunk); queued += chunk.Length; }
        }

        // Called by Unity's audio thread. Silence when Abe has nothing to say.
        static void Fill(float[] data)
        {
            var filled = 0;
            var sum = 0f;
            lock (gate)
            {
                while (filled < data.Length && playing.Count > 0)
                {
                    var chunk = playing.Peek();
                    var take = Math.Min(data.Length - filled, chunk.Length - playHead);
                    Array.Copy(chunk, playHead, data, filled, take);
                    for (var i = filled; i < filled + take; i++) sum += data[i] * data[i];
                    filled += take;
                    playHead += take;
                    queued -= take;
                    if (playHead == chunk.Length) { playing.Dequeue(); playHead = 0; }
                }
            }
            Array.Clear(data, filled, data.Length - filled);
            if (filled == 0) return;
            // Loudness for Abe's sculpture: speech is quiet as raw numbers, so lift it into 0..1.
            level = Mathf.Clamp01(Mathf.Sqrt(sum / filled) * 5);
            Interlocked.Exchange(ref lastSound, clock.ElapsedTicks);
        }
    }
}
