// The LincLife site's AI backend. Asks POST /api/intake to read one spoken or typed answer,
// exactly as the website does (apps/web/src/intake/ai.ts). Hands back null when the
// AI can't be reached, so the chat falls back to the script.
using System;
using System.Collections;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace Advisor3D
{
    public static class Backend
    {
        public static string Site = "https://codelinc.codehawks.org";

        static readonly string[] INTENTS = { "answer", "unsure", "skip", "why", "question", "unclear" };

        static string Clip(string text, int max) => text.Length > max ? text.Substring(0, max) : text;

        public static void ReadAnswer(string stepId, string asked, string text, AppState state, Action<Reading> done)
        {
            // The editor's screenshot pass has no frames to wait on, so it reads with the script.
            if (!Application.isPlaying) { done(null); return; }
            App.I.StartCoroutine(Post(stepId, asked, text, state, done));
        }

        static IEnumerator Post(string stepId, string asked, string text, AppState state, Action<Reading> done)
        {
            var body = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(new JObject
            {
                ["step"] = stepId,
                ["question"] = Clip(asked, 600),
                ["answer"] = Clip(text, 1000),
                ["known"] = JObject.FromObject(Script.Known(state)),
            }));
            using var request = Json(Site + "/api/intake", body);
            yield return request.SendWebRequest();

            Reading reading = null;
            if (request.result == UnityWebRequest.Result.Success)
            {
                try { reading = Parse(JObject.Parse(request.downloadHandler.text)); }
                catch (Exception) { /* not the reply we expect: fall back to the script */ }
            }
            else Debug.LogWarning($"The AI backend did not answer ({request.responseCode}); reading with the script.");
            done(reading);
        }

        static UnityWebRequest Json(string url, byte[] body)
        {
            // CloudFront signs requests to the backend and needs the hash of the exact body bytes.
            string hash;
            using (var sha = SHA256.Create()) hash = string.Concat(sha.ComputeHash(body).Select(b => b.ToString("x2")));
            var request = new UnityWebRequest(url, "POST")
            {
                uploadHandler = new UploadHandlerRaw(body),
                downloadHandler = new DownloadHandlerBuffer(),
                timeout = 12,
            };
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("x-amz-content-sha256", hash);
            return request;
        }

        // Asks POST /api/voice/session for a short-lived secret to talk with Abe (see Voice.cs).
        // Hands back null when voice can't be started. To try voice against a backend on your own
        // computer, put its address in Assets/Resources/voice-endpoint.txt (see README.md).
        public static void VoiceSession(Action<JObject> done) => App.I.StartCoroutine(PostVoiceSession(done));

        static IEnumerator PostVoiceSession(Action<JObject> done)
        {
            var local = Resources.Load<TextAsset>("voice-endpoint");
            var url = local && local.text.Trim() != "" ? local.text.Trim() : Site + "/api/voice/session";
            using var request = Json(url, Encoding.UTF8.GetBytes("{}"));
            yield return request.SendWebRequest();

            JObject session = null;
            if (request.result == UnityWebRequest.Result.Success)
            {
                try { session = JObject.Parse(request.downloadHandler.text); }
                catch (Exception) { /* not the reply we expect: no voice */ }
            }
            else Debug.LogWarning($"The backend did not start a voice session ({request.responseCode} from {url}).");
            done(session);
        }

        static Reading Parse(JObject r)
        {
            var intent = (string)r["intent"];
            if (Array.IndexOf(INTENTS, intent) < 0) return null;
            static bool Number(JToken t) => t != null && (t.Type == JTokenType.Integer || t.Type == JTokenType.Float);
            var reading = new Reading
            {
                intent = intent,
                value = Number(r["value"]) ? (long?)Math.Round((double)r["value"]) : null,
                household = r["household"]?.Type == JTokenType.String ? (string)r["household"] : null,
                period = (string)r["period"] == "month" || (string)r["period"] == "year" ? (string)r["period"] : null,
                say = r["say"]?.Type == JTokenType.String ? (string)r["say"] : "",
            };
            if (r["extra"] is JObject extra)
            {
                foreach (var kv in extra) if (Number(kv.Value)) reading.extra[kv.Key] = (long)Math.Round((double)kv.Value);
            }
            return reading;
        }
    }
}
