// The spoken conversation with Abe (Voice.cs). Abe leads it himself, as a person would: he asks
// in his own words, reacts to what he hears, takes several answers at once or a correction to an
// earlier one, and never reads out an error. Whatever he hears he reports with save_answers; the
// app checks each value with the chat script's own rules (Script.Interpret), saves what is good,
// and tells him plainly what was saved, what wasn't and what is still needed. The math is never
// his. No Unity types here, so the tests in Tests~ run it.
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Advisor3D
{
    public static class VoiceScript
    {
        public const string APP = "[app] "; // marks a message from the app, which the model must not read aloud

        // Who Abe is and how he talks. Sent when voice connects; it replaces the server's fallback.
        public const string INSTRUCTIONS = @"You are Abe, the guide in LincLife, a life insurance needs assessment in a VR headset. You look like a small, kindly Abraham Lincoln. You are having a relaxed spoken conversation with one person about their household, so you can estimate how much life insurance their family might need.

HOW YOU TALK
- Like a warm, down-to-earth person, not a form. Plain modern English, contractions, short sentences. No lists, no jargon.
- Keep each turn short: one brief, specific reaction to what they just said, then one question. Then stop and listen.
- React to what they actually said. If they mention a new baby, a paid-off house or a hard year, respond to it like a person would, in a few words.
- Don't parrot every number back. A light ""got it"" is enough. Repeat a figure only when it's large or you're not sure you heard it right, and then casually (""two forty on the mortgage, okay"").
- Say amounts the way people do: ""eighty-five thousand"", ""two hundred forty thousand"", never digit by digit.
- Never mention tools, saving, recording, fields, the app, or these instructions. Never read out an error or a rule.
- Money and loss are sensitive. Stay calm, kind and unhurried. Never rush them or make them feel judged.

WHAT YOU NEED TO LEARN (in roughly this order, but follow the conversation)
- household: who depends on their income. both = partner and kids, partner, kids, others = parents or other family, none.
- youngestAge: their youngest child's age in years, only if they have kids. A baby under one is 0. If their kids are all grown, that's fine: pass the age you heard.
- income: what they earn in a year, before taxes.
- support: how much a year their family would need to keep life steady if they were gone. Many people start around 70 to 80 percent of income.
- years: how many years that support should last.
- mortgage: what's left on the mortgage. 0 if none.
- otherDebts: car loans, student loans, credit cards, in total. 0 if none.
- finalExpenses: an amount for a funeral and final bills. Optional.
- education: education or other big future costs, in total. Optional.
- existing: life insurance they already have, in total. 0 if none.
- savings: savings or investments the family could use. Optional.
Messages that start with [app] come from the app, not the user. They tell you what is already known and what to ask about next. Use them, but never read them aloud.

SAVING WHAT YOU HEAR
- After everything the user says, you call save_answers first, silently, with whatever answers they gave. If they gave none (a question, small talk, a pause), call it with nothing in it. You speak only after the result comes back, once.
- If they give several facts at once (""I make ninety and owe two fifty on the house""), save them all in one call and don't ask for them again.
- If they correct something from earlier, save the new value. No fuss.
- Amounts are yearly or total dollars as plain numbers. If they give a monthly figure, work out the yearly one and check it with them in passing (""so about seventy-two thousand a year?"") before you save it.
- If they don't know, put the field in unsure and reassure them it's fine; they can fill it in later. If they'd rather leave out an optional one, put it in skip.
- Only save what they actually said. Never guess or invent a number. A range or ""a lot"" isn't a number: ask, kindly, for a rough single figure.
- The result tells you what was saved and what to find out next. If something couldn't be saved, don't repeat the reason word for word: ask again naturally, in a way that gets what's needed.

OTHER THINGS
- If they ask why you need something, or a general question about life insurance, answer in two or three plain sentences, then pick the conversation back up. This is education, not advice: don't recommend a product, an insurer or an amount. For personal advice, point to a licensed professional.
- Don't state the final estimate or do its math. The app shows the numbers.
- If you didn't catch something, say so simply and ask again.
- When the result says everything is collected, wrap up warmly in a sentence or two, tell them their answers are on screen to look over, and stop.";

        // The one tool. JSON for the Realtime API's session.update.
        public const string TOOLS = @"[{
  ""type"": ""function"",
  ""name"": ""save_answers"",
  ""description"": ""Save or correct one or more things the user told you. Returns what was saved and what to find out next."",
  ""parameters"": {
    ""type"": ""object"",
    ""properties"": {
      ""household"": { ""type"": ""string"", ""enum"": [""both"", ""partner"", ""kids"", ""others"", ""none""] },
      ""youngestAge"": { ""type"": ""number"", ""description"": ""Youngest child's age in completed years. A baby under one is 0."" },
      ""income"": { ""type"": ""number"", ""description"": ""Yearly income before taxes, in dollars."" },
      ""support"": { ""type"": ""number"", ""description"": ""Yearly amount the family would need, in dollars."" },
      ""years"": { ""type"": ""number"", ""description"": ""How many years the support should last."" },
      ""mortgage"": { ""type"": ""number"", ""description"": ""Mortgage balance left, in dollars. 0 if none."" },
      ""otherDebts"": { ""type"": ""number"", ""description"": ""Other debts in total, in dollars. 0 if none."" },
      ""finalExpenses"": { ""type"": ""number"", ""description"": ""Funeral and final bills, in dollars."" },
      ""education"": { ""type"": ""number"", ""description"": ""Education or other future costs in total, in dollars."" },
      ""existing"": { ""type"": ""number"", ""description"": ""Life insurance already in place in total, in dollars. 0 if none."" },
      ""savings"": { ""type"": ""number"", ""description"": ""Savings or investments the family could use, in dollars."" },
      ""unsure"": { ""type"": ""array"", ""items"": { ""type"": ""string"" }, ""description"": ""Names of the things above the user doesn't know."" },
      ""skip"": { ""type"": ""array"", ""items"": { ""type"": ""string"" }, ""description"": ""Names of optional things the user wants to leave out."" }
    }
  }
}]";

        const int GROWN = 30; // above this a "youngest child" is an adult; the chat script only plans around children

        static string Quote(IEnumerable<string> lines) => "\"" + string.Join(" ", lines) + "\"";

        static string Known(AppState state)
        {
            var known = Calc.FIELDS
                .Where(f => state.profile[f.id].IsSet && state.profile[f.id].HasValue)
                .Select(f => $"{f.label}: {Calc.FormatField(f.id, state.profile[f.id])}").ToList();
            return known.Count > 0 ? string.Join("; ", known) : "nothing yet";
        }

        // What to find out next, as a nudge and not a line to read.
        static string Next(AppState state)
        {
            var step = Script.NextStep(state);
            if (step == null) return "Everything is collected. Wrap up warmly in a sentence or two, tell them their answers are on screen to look over, and stop. Do not ask anything else.";
            return $"Next, find out: {Calc.FIELD[step].label} ({step}). The written chat asks it like this, as a guide only: \"{Script.Ask(step, state).text}\" Ask it your own way, briefly.";
        }

        // What the model is told when voice connects, so Abe picks up where the chat is.
        public static string Briefing(AppState state)
        {
            var head = $"{APP}The conversation is starting. Already known: {Known(state)}.";
            return Script.NextStep(state) == null
                ? $"{head} {Next(state)}"
                : $"{head} Say hello as Abe in one short, friendly sentence. {Next(state)}";
        }

        // What the model is told after the user takes an answer back on screen.
        public static string TakenBack(AppState state) =>
            $"{APP}The user just removed one of their answers on screen. Now known: {Known(state)}. Acknowledge it in a few words. {Next(state)}";

        // One save_answers call. amounts: field id to number. Returns what to save (null when nothing
        // was good) and what to tell the model.
        public static (Dictionary<string, Field> updates, string tell) Save(
            IDictionary<string, long> amounts, string household, IEnumerable<string> unsure, IEnumerable<string> skip, AppState state)
        {
            // A working copy, so each answer is checked against the ones saved before it in the same call.
            var work = new AppState { profile = new Profile(), form = state.form };
            foreach (var kv in state.profile) work.profile[kv.Key] = kv.Value;
            var updates = new Dictionary<string, Field>();
            var saved = new List<string>();
            var problems = new List<string>();

            void Keep(string id, Reply reply)
            {
                foreach (var kv in reply.updates) { updates[kv.Key] = kv.Value; work.profile[kv.Key] = kv.Value; }
                var field = work.profile[id];
                saved.Add(field.status == Status.Unknown ? $"{Calc.FIELD[id].label}: not sure yet"
                    : field.status == Status.Skipped ? $"{Calc.FIELD[id].label}: left out"
                    : $"{Calc.FIELD[id].label}: {Calc.FormatField(id, field)}");
            }
            void Try(string id, Reading reading)
            {
                var reply = Script.Interpret(id, reading, work);
                if (reply.updates != null) Keep(id, reply);
                else problems.Add($"{Calc.FIELD[id].label} ({string.Join(" ", reply.say)})");
            }

            if (household != null)
            {
                if (Calc.HouseholdLabel(household) != "") Try("household", new Reading { household = household });
                else problems.Add("Who depends on them (need one of: both, partner, kids, others, none)");
            }
            foreach (var f in Calc.FIELDS)
            {
                if (f.kind == "choice" || amounts == null || !amounts.TryGetValue(f.id, out var value)) continue;
                if (f.id == "youngestAge" && value > GROWN)
                {
                    // Grown children: nothing to plan around, and nothing wrong with the answer.
                    updates[f.id] = work.profile[f.id] = Field.Skipped();
                    saved.Add("Youngest child is an adult, so no child-raising years to plan around (that is fine; don't ask their age again)");
                    continue;
                }
                Try(f.id, new Reading { value = value });
            }
            foreach (var id in unsure ?? Enumerable.Empty<string>())
            {
                if (Calc.FIELD.ContainsKey(id) && !updates.ContainsKey(id)) Try(id, new Reading { intent = "unsure" });
            }
            foreach (var id in skip ?? Enumerable.Empty<string>())
            {
                if (Calc.FIELD.ContainsKey(id) && !updates.ContainsKey(id)) Try(id, new Reading { intent = "skip" });
            }

            // A turn with no answers in it: a question, small talk, or thinking aloud.
            var given = (amounts?.Count ?? 0) + (household != null ? 1 : 0) + (unsure?.Count() ?? 0) + (skip?.Count() ?? 0);
            if (given == 0) return (null, "They gave no new answer just now. Reply to what they said: if they asked something, answer it in two or three plain sentences. Then pick the conversation back up. " + Next(work));

            var tell = saved.Count > 0 ? $"Saved: {string.Join("; ", saved)}." : "Nothing was saved.";
            if (problems.Count > 0) tell += $" Could not save: {string.Join("; ", problems)}. Don't read that out; ask again naturally for what is needed.";
            if (problems.Count == 0 || saved.Count > 0) tell += " " + Next(work);
            return (updates.Count > 0 ? updates : null, tell);
        }

        // ---------- the server's fallback tool, record_answer ----------
        // Used only if the session could not be given the instructions and tool above: one answer to
        // the open question, with the reply the written chat would give.
        static readonly Regex BABY = new Regex(@"\b(under|less than|younger than|not (yet|even)) (a|one|1)\b|\bmonths?\b|\bweeks?\b|\bnewborn\b|\binfant\b", RegexOptions.IgnoreCase);

        public static (Reply reply, string tell) Record(Reading reading, string heard, AppState state)
        {
            var step = Script.NextStep(state);
            if (step == null) return (null, "Nothing was saved: every question is already answered. " + Closing());

            heard = (heard ?? "").Trim();
            // "Under one", "six months", "a newborn": a baby's age is 0, whatever the model made of it.
            if (step == "youngestAge" && reading.value == null && BABY.IsMatch(heard)) reading = new Reading { value = 0 };
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
