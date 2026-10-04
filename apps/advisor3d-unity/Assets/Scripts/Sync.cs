// Keeps the headset and a paired browser on the same answers. Joining loads the Basics answers
// the browser saved and opens the chat; after that every change to the answers is saved back.
// When the conversation ends the pairing is marked done, and the browser says so while the
// wearer goes on to their results here. On the last screen (or when the headset comes off on
// the results) it is marked handoff, which is the browser's cue to open those same results.
// Pairing.cs has the shapes; apps/backend/pairing.py the server.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Advisor3D
{
    public static class Sync
    {
        public static string Status { get; private set; } = "off"; // off | joining | paired | failed
        public static bool Paired => Status == "paired";

        // The browser has everything, results included: there is nothing left on its way.
        public static bool Delivered => id != null && handed && !dirty && !sending && sentHandoff;
        const float SETTLE = 0.4f; // seconds to let a burst of changes finish before saving
        const float RETRY = 3;     // seconds before trying again after a save that did not get through
        const float COOL = 5;      // seconds a failed code is reported, and before the same QR code is tried again

        static string id, failedId, sent;
        static AppState paired; // the answers this pairing loaded; a fresh start replaces them and ends it
        static bool dirty, sending, done, handed, sentHandoff;
        static float wait, cool;

        // Called once the store is ready (App.Build). The editor keeps statics between plays.
        public static void Start()
        {
            Leave();
            Store.Changed += Mark;
            Store.RouteChanged += Mark;
        }

        static void Leave()
        {
            id = failedId = sent = null;
            paired = null;
            dirty = sending = done = handed = sentHandoff = false;
            Status = "off";
        }

        static void Mark()
        {
            if (id == null) return;
            if (!dirty) wait = SETTLE;
            dirty = true;
        }

        // The six digits typed in the headset stand in for the QR code.
        public static void JoinCode(string code)
        {
            if (Status == "joining") return;
            Status = "joining";
            Backend.Call("/api/pair/join", new JObject { ["code"] = code }, (status, reply) =>
            {
                var found = Pairing.ReadQr(Pairing.QR_PREFIX + (string)reply?["id"]);
                if (status == 200 && found != null) { Status = "off"; Join(found); }
                else { Status = "failed"; cool = COOL; }
            });
        }

        public static void Join(string pairing)
        {
            if (Status == "joining" || Paired || (pairing == failedId && cool > 0)) return;
            Status = "joining";
            Backend.Call("/api/pair/" + pairing, null, (status, reply) =>
            {
                // Leaving the connect screen while the answers were on their way wins: the wearer chose another way.
                if (Store.Route != "connect") { Status = "off"; return; }
                var state = status == 200 ? Read(reply) : null;
                if (state == null)
                {
                    Debug.LogWarning($"Advisor3D: could not join the browser's session ({status}).");
                    failedId = pairing;
                    cool = COOL;
                    Status = "failed";
                    return;
                }
                id = pairing;
                paired = state;
                sent = null;
                done = handed = sentHandoff = false;
                Status = "paired";
                Store.Load(state);
                Mark(); // tells the browser the headset has joined
                App.Blip(990, 0.16f, 0.05f);
                Store.Go("chat");
            });
        }

        // The answers a browser saved, as this app's state. Null when the reply is not a pairing.
        static AppState Read(JObject reply)
        {
            if (!(reply?["profile"] is JObject profile) || !(reply["form"] is JObject form)) return null;
            static bool Number(JToken t) => t != null && (t.Type == JTokenType.Integer || t.Type == JTokenType.Float);
            static long? Whole(JToken t) => Number(t) ? (long?)Math.Round((double)t) : null;
            var state = new AppState { started = true };
            foreach (var f in Calc.FIELDS)
            {
                if (!(profile[f.id] is JObject field)) continue;
                var value = field["value"];
                state.profile[f.id] = Pairing.ReadField(f.id, (string)field["status"], Whole(value),
                    value?.Type == JTokenType.String ? (string)value : null, (string)field["source"] == "form");
            }
            var marital = (string)form["marital"];
            state.form = new Form
            {
                age = Whole(form["age"]), income = Whole(form["income"]), dependents = Whole(form["dependents"]), debt = Whole(form["debt"]),
                marital = marital == "single" || marital == "married" ? marital : null,
                coverage = form["coverage"]?.Type == JTokenType.Boolean ? (bool?)form["coverage"] : null,
            };
            Script.ApplyForm(state);
            return state;
        }

        // The conversation is over once Abe has said his closing words, or the wearer has moved on to Review.
        static bool Finished(AppState s)
        {
            if (Store.Route == "review" || Store.Route == "results" || Store.Route == "handoff") return true;
            return Store.Route == "chat" && !s.typing && s.messages.Count > 0 && s.messages[s.messages.Count - 1].done;
        }

        public static void Tick(float dt)
        {
            // A code that failed is said so for a few seconds, then the app goes back to looking.
            if (cool > 0 && (cool -= dt) <= 0 && Status == "failed") Status = "off";
            if (id == null) return;
            // Start Over, or a sample family: these are no longer the browser's answers.
            if (Store.State != paired) { Leave(); return; }
            if (!dirty || sending) return;
            wait -= dt;
            if (wait <= 0) Save();
        }

        // Taking the headset off: save now rather than after the usual pause. Taking it off on the
        // results is the wearer going back to their computer, so the browser opens them too.
        public static void Flush()
        {
            if (id == null || Store.State != paired) return;
            if (Store.Route == "results" && !handed) { handed = true; dirty = true; }
            if (dirty && !sending) Save();
        }

        static void Save()
        {
            var s = Store.State;
            done |= Finished(s);
            handed |= Store.Route == "handoff";
            var handoff = handed;
            var body = new JObject
            {
                ["status"] = handoff ? "handoff" : done ? "done" : "joined",
                ["profile"] = JObject.FromObject(Pairing.Wire(s.profile)),
                ["form"] = JObject.FromObject(Pairing.Wire(s.form)),
            };
            var text = body.ToString(Formatting.None);
            dirty = false;
            if (text == sent) return;
            sending = true;
            var to = id;
            Backend.Call("/api/pair/" + to, body, (status, reply) =>
            {
                if (to != id) return; // started over while this was on its way
                sending = false;
                if (status == 200) { sent = text; sentHandoff = handoff; }
                else if (status == 404) Leave(); // the pairing expired; the headset carries on by itself
                else { dirty = true; wait = RETRY; }
            });
        }
    }
}
