// What the voice model is told. Abe's voice (Voice.cs) hears the user and speaks, but the app
// stays in charge: each answer the model reports goes through the chat script's own checks
// (Script.Interpret), and the result tells the model what to say next. No Unity types, so the
// tests in Tests~ run it.
using System.Collections.Generic;
using System.Linq;

namespace Advisor3D
{
    public static class VoiceScript
    {
        public const string APP = "[app] "; // marks a message from the app, which the model must not read aloud

        static string Quote(IEnumerable<string> lines) => "\"" + string.Join(" ", lines) + "\"";

        // What the model is told when voice connects, so Abe picks up where the chat is.
        public static string Briefing(AppState state)
        {
            var known = Calc.FIELDS
                .Where(f => state.profile[f.id].IsSet && state.profile[f.id].HasValue)
                .Select(f => $"{f.label}: {Calc.FormatField(f.id, state.profile[f.id])}").ToList();
            var head = $"{APP}Voice connected. Answers so far: {(known.Count > 0 ? string.Join("; ", known) : "none yet")}.";
            var step = Script.NextStep(state);
            if (step == null) return $"{head} Everything is already collected. Tell them their answers are ready to review on screen. Do not ask anything.";
            if (state.pending != null) return $"{head} Greet them in one short sentence, then ask: \"Is {Calc.FormatMoney(state.pending.Value)} a monthly amount?\"";
            return $"{head} Greet them in one short sentence, then ask this in your own warm words: \"{Script.Ask(step, state).text}\"";
        }

        // What the model is told after the user takes an answer back on screen.
        public static string TakenBack(AppState state)
        {
            var step = Script.NextStep(state);
            var head = $"{APP}The user took an answer back on screen. Say you’ve taken it off your list, then";
            return step == null ? $"{head} say: \"{Script.CLOSING}\" Do not ask anything else." : $"{head} ask: \"{Script.Ask(step, state).text}\"";
        }

        // One record_answer call. Returns the script's reply (for the caller to save) and what to
        // tell the model. reply is null when there is no question open.
        public static (Reply reply, string tell) Record(Reading reading, string heard, AppState state)
        {
            var step = Script.NextStep(state);
            if (step == null) return (null, "Nothing was saved: every question is already answered. " + Closing());

            heard = (heard ?? "").Trim();
            // A monthly amount is waiting for a yes or no, which the script reads from the user's words.
            var reply = state.pending != null ? Script.Respond(step, heard, state) : Script.Interpret(step, reading, state, heard);

            if (reply.updates == null)
            {
                var again = reply.pendingSet && reply.pending != null
                    ? " When they answer, call record_answer again with their reply in heard."
                    : " Then wait for their answer.";
                return (reply, $"Not saved yet. Say this in your own words: {Quote(reply.say)}{again}");
            }

            // What the script would ask next, once these answers are in.
            var after = new AppState { profile = new Profile(), form = state.form };
            foreach (var kv in state.profile) after.profile[kv.Key] = kv.Value;
            foreach (var kv in reply.updates) after.profile[kv.Key] = kv.Value;
            var next = Script.NextStep(after);
            var said = $"Saved. Say this briefly in your own words: {Quote(reply.say)}";
            return (reply, next == null ? $"{said} {Closing()}" : $"{said} Then ask: \"{Script.Ask(next, after).text}\"");
        }

        static string Closing() => $"Then say: \"{Script.CLOSING}\" Do not ask anything else.";
    }
}
