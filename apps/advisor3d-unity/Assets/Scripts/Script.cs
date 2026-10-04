// Guided conversation: what to ask next, why we ask it, and how to read the answer.
// A C# port of the site's apps/web/src/intake/script.ts; keep the two in step.
// Respond() reads an answer with fixed rules: it handles tapped suggestions and is the
// fallback when the AI can't be reached. Interpret() takes the AI's reading of a spoken or
// typed answer and puts it through the same checks, so both return the same Reply.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Advisor3D
{
    public class Question { public string text; public List<string> replies; }

    public class Reply
    {
        public Dictionary<string, Field> updates;
        public List<string> say;
        public bool pendingSet; // false leaves the stored pending amount as it is
        public long? pending;
        public List<string> replies;
        public bool why;
    }

    // What the AI endpoint returns for one typed or spoken answer.
    public class Reading
    {
        public string intent = "answer"; // answer | unsure | skip | why | question | unclear
        public long? value;
        public string household, period;
        public Dictionary<string, long> extra = new Dictionary<string, long>(); // other fields stated in the same message
        public string say = "";
    }

    public static class Script
    {
        public const string GUIDE_NAME = "Abe";
        public const string WHY = "Why do you ask?";
        public const string CLOSING = "That’s everything I need. Let’s look over your answers together, and then I’ll show you the math.";

        class Read { public bool ok; public Val value; public string retry; public long? clarify; }

        class Step
        {
            public string id;
            public Func<AppState, bool> when;
            public Func<AppState, Question> ask;
            public string why;
            public bool optional;
            public Func<string, AppState, Read> read;
            public Func<Val, AppState, string> ack;
            // Other fields this answer settles, like the debts left once the mortgage is known.
            public Func<Val, AppState, Dictionary<string, Field>> also;
        }

        static bool Has(Profile p, string id) => p[id].status != Status.Empty;
        static Field Known(Profile p, string id) => p[id].IsSet ? p[id] : null;
        static bool HasKids(AppState s) { var h = Known(s.profile, "household")?.choice; return h == "kids" || h == "both"; }
        // Total debt from the form, when it's above zero. Abe then asks how much of it is the mortgage.
        static long? DebtTotal(AppState s) => (s.form.debt ?? 0) > 0 ? s.form.debt : null;
        static string Money(Val v) => Calc.FormatMoney(v.N);
        static Question Q(string text, params string[] replies) => new Question { text = text, replies = replies.ToList() };
        static Read Retry(string text) => new Read { retry = text };
        static Read Value(Val v) => new Read { ok = true, value = v };

        static Func<string, AppState, Read> MoneyReader(bool monthlyCheck = false) => (text, s) =>
        {
            var r = Calc.ParseAmount(text);
            if (r.kind == "negative") return Retry("Amounts can’t be negative. What’s the amount?");
            if (r.kind != "amount") return Retry("I didn’t catch an amount. You can type something like 75,000 or 75k, or say “not sure.”");
            if (monthlyCheck && r.period == "month") return new Read { clarify = r.value };
            return Value(r.value);
        };

        static Func<string, AppState, Read> CountReader(long min, long max, string noun) => (text, s) =>
        {
            var r = Calc.ParseCount(text, min, max);
            if (r.kind == "range") return Retry($"Please enter {noun} between {min} and {max}.");
            if (r.kind != "amount") return Retry($"I didn’t catch {noun}. Try a number like 10.");
            return Value(r.value);
        };

        static long Thousands(double v) => (long)Math.Floor(v / 1000 + 0.5) * 1000;

        static readonly Step[] STEPS =
        {
            new Step
            {
                id = "household",
                ask = s =>
                {
                    var n = s.form.dependents ?? 0;
                    if (n > 0)
                    {
                        return new Question
                        {
                            text = $"You mentioned {n} {(n == 1 ? "person depends" : "people depend")} on your income. Who {(n == 1 ? "is that" : "are they")}?",
                            replies = Calc.HOUSEHOLD.Where(h => h.key != "none").Select(h => h.label).ToList(),
                        };
                    }
                    return new Question { text = "Let’s start with the people who count on you. Who depends on your income?", replies = Calc.HOUSEHOLD.Select(h => h.label).ToList() };
                },
                why = "Life insurance is there for the people who rely on your paycheck. Knowing who they are helps us ask the right questions next.",
                read = (text, s) =>
                {
                    var t = text.ToLowerInvariant();
                    var partner = Regex.IsMatch(t, "partner|spouse|wife|husband|fianc");
                    var kids = Regex.IsMatch(t, "kid|child|son|daughter|baby|children");
                    if (Regex.IsMatch(t, "no one|nobody|none|just me|myself")) return Value("none");
                    if (partner && kids) return Value("both");
                    if (partner) return Value("partner");
                    if (kids) return Value("kids");
                    if (Regex.IsMatch(t, "parent|mom|dad|mother|father|sibling|brother|sister|relative|family|grand")) return Value("others");
                    return Retry("Could you tell me who that is? For example, a partner, kids, parents, or no one right now.");
                },
                ack = (v, s) => v.H == "none"
                    ? "Thanks. Even without dependents, coverage can help with debts and final costs, so we’ll look at those."
                    : "Thanks for sharing that. We’ll keep them in mind as we go.",
            },
            new Step
            {
                id = "youngestAge",
                when = HasKids,
                ask = s => Q("How old is your youngest child?", "Under 1", "5", "10", "15"),
                why = "Your youngest child’s age helps you think about how many years your family might need support. You’ll still choose the number of years yourself.",
                read = (text, s) => Regex.IsMatch(text.ToLowerInvariant(), @"under\s*1|newborn|baby|infant|months?\b") ? Value(0) : CountReader(0, 30, "an age")(text, s),
                ack = (v, s) => "Got it, " + (v.N == 0 ? "under a year old" : v.N + " years old") + ".",
            },
            new Step
            {
                id = "income",
                ask = s => Q("About how much do you earn in a year, before taxes?", "$50,000", "$75,000", "$100,000", "Not sure"),
                why = "Your income is what your family would lose. We use it as a starting point for how much support they’d need. It isn’t plugged straight into the math.",
                read = MoneyReader(monthlyCheck: true),
                ack = (v, s) => $"Thanks, {Money(v)} a year.",
            },
            new Step
            {
                id = "support",
                ask = s =>
                {
                    var income = Known(s.profile, "income")?.num;
                    if (income > 0)
                    {
                        // Rounded to thousands, or to hundreds for a small income, where thousands would give
                        // the same figure twice ("$4,000 to $4,000").
                        long Rounded(double v) => income.Value < 20000 ? (long)Math.Floor(v / 100 + 0.5) * 100 : Thousands(v);
                        var lo = Rounded(income.Value * 0.7);
                        var hi = Rounded(income.Value * 0.8);
                        const string lead = "If something happened to you, how much would your family need each year to keep their life on track? Many people start with 70–80% of their income.";
                        if (lo == hi) return lo > 0 ? Q($"{lead} For you, that’s about {Calc.FormatMoney(lo)}.", Calc.FormatMoney(lo), "Not sure") : Q(lead, "Not sure");
                        return Q($"{lead} For you, that’s about {Calc.FormatMoney(lo)} to {Calc.FormatMoney(hi)}.",
                            Calc.FormatMoney(lo), Calc.FormatMoney(hi), "Not sure");
                    }
                    return Q("If something happened to you, how much would your family need each year to keep their life on track?", "$30,000", "$50,000", "Not sure");
                },
                why = "This is the yearly amount that would replace your paycheck for your family, covering things like groceries, rent, and bills. It’s often a bit less than your income because some of your own costs go away.",
                read = MoneyReader(monthlyCheck: true),
                ack = (v, s) => $"Okay, {Money(v)} a year.",
            },
            new Step
            {
                id = "years",
                ask = s =>
                {
                    var age = Known(s.profile, "youngestAge")?.num;
                    if (age < 22)
                    {
                        var until = 22 - age.Value;
                        return Q($"For how many years should that support last? If you want to cover your youngest until about age 22, that’s {until} years.",
                            $"{until} years", "10 years", "20 years", "Not sure");
                    }
                    return Q("For how many years should that support last?", "5 years", "10 years", "20 years", "Not sure");
                },
                why = "Families often pick a time frame that lasts until the kids are grown, or until a partner retires. More years means more coverage.",
                read = CountReader(1, 70, "a number of years"),
                ack = (v, s) => $"{v.N} {(v.N == 1 ? "year" : "years")} it is.",
            },
            new Step
            {
                id = "mortgage",
                ask = s =>
                {
                    var total = DebtTotal(s);
                    if (total != null) return Q($"You said you have about {Calc.FormatMoney(total.Value)} in total debt. How much of that is left on a mortgage?", "No mortgage", "All of it", "Not sure");
                    return Q("Do you have a mortgage? If so, about how much is left to pay?", "No mortgage", "Not sure");
                },
                why = "Paying off the house means your family could stay in their home without a monthly payment. You can find the balance on your latest mortgage statement.",
                read = (text, s) =>
                {
                    var total = DebtTotal(s);
                    if (total == null) return MoneyReader()(text, s);
                    if (Regex.IsMatch(text.ToLowerInvariant(), @"\b(all( of it)?|the whole (thing|amount)|everything|it'?s all)\b")) return Value(total.Value);
                    var r = MoneyReader()(text, s);
                    if (r.ok && r.value.N > total)
                    {
                        return Retry($"That’s more than the {Calc.FormatMoney(total.Value)} total you entered. How much of the {Calc.FormatMoney(total.Value)} is the mortgage? You can fix the total during review.");
                    }
                    return r;
                },
                also = (v, s) =>
                {
                    var total = DebtTotal(s);
                    var more = new Dictionary<string, Field>();
                    if (total != null) more["otherDebts"] = Field.Of(Status.Proposed, total.Value - v.N);
                    return more;
                },
                ack = (v, s) =>
                {
                    var total = DebtTotal(s);
                    if (total == null) return v.N == 0 ? "No mortgage, got it." : $"Thanks, {Money(v)} left on the mortgage.";
                    if (v.N == 0) return $"Got it, no mortgage. So all {Calc.FormatMoney(total.Value)} is other debts.";
                    if (v.N == total) return $"Got it, all {Calc.FormatMoney(total.Value)} is the mortgage.";
                    return $"Got it, {Money(v)} on the mortgage and {Calc.FormatMoney(total.Value - v.N)} in other debts.";
                },
            },
            new Step
            {
                id = "otherDebts",
                ask = s => Q("Any other debts, like car loans, student loans, or credit cards? A rough total is fine.", "None", "Not sure"),
                why = "Debts don’t always go away when someone passes. Covering them keeps them from landing on your family.",
                read = MoneyReader(),
                ack = (v, s) => v.N == 0 ? "No other debts. Nice." : $"Got it, {Money(v)} in other debts.",
            },
            new Step
            {
                id = "finalExpenses",
                ask = s => Q("Would you like to set aside an amount for funeral and final expenses? This one is optional.", "$10,000", "$15,000", "Skip this"),
                why = "Funeral costs and final bills come due quickly. Setting aside an amount means your family won’t have to cover them out of pocket.",
                optional = true,
                read = MoneyReader(),
                ack = (v, s) => v.N == 0 ? "Okay, nothing set aside." : $"Okay, {Money(v)} for final expenses.",
            },
            new Step
            {
                id = "education",
                ask = s => HasKids(s)
                    ? Q("Do you want to help pay for your kids’ education? If so, about how much in total? This one is optional.", "$20,000", "$50,000", "Skip this")
                    : Q("Is there a big future cost you’d want covered, like someone’s education? This one is optional.", "No", "Skip this"),
                why = "College or training is a large cost many parents want covered. Include only what isn’t already part of the yearly support amount.",
                optional = true,
                read = MoneyReader(),
                ack = (v, s) => v.N == 0 ? "Okay, none for now." : $"Got it, {Money(v)} for future costs.",
            },
            new Step
            {
                id = "existing",
                ask = s => s.form.coverage == true
                    ? Q("You mentioned you have life insurance. About how much coverage is it in total, including any through work?", "Not sure")
                    : Q("Do you already have life insurance, through work or on your own? What’s the total amount?", "None", "Not sure"),
                why = "Coverage you already have counts toward what your family needs. If it’s through work, check your benefits portal or ask HR for the amount.",
                read = MoneyReader(),
                ack = (v, s) => v.N == 0 ? "No current coverage, noted." : $"Great, {Money(v)} already in place.",
            },
            new Step
            {
                id = "savings",
                ask = s => Q("Last one. Do you have savings or investments your family could use? This one is optional.", "None", "Skip this"),
                why = "Savings your family could draw on lowers how much insurance they’d need. Leave out retirement money you’d want them to keep.",
                optional = true,
                read = MoneyReader(),
                ack = (v, s) => v.N == 0 ? "Okay, no savings counted." : $"Thanks, {Money(v)} in savings.",
            },
        };

        static readonly Dictionary<string, Step> STEP = STEPS.ToDictionary(s => s.id);

        // Apply the form's answers before the chat so Abe skips what's already known.
        // Re-running it (after going back to the form) updates its own unconfirmed answers only.
        public static void ApplyForm(AppState state)
        {
            var p = state.profile;
            var f = state.form;
            void Set(string id, Field value)
            {
                if (p[id].status == Status.Empty || (p[id].fromForm && p[id].status == Status.Proposed)) p[id] = value;
            }
            if (f.income != null) Set("income", Field.Of(Status.Proposed, f.income.Value, true));
            // With no dependents we know the answer; otherwise Abe asks who they are.
            if (f.dependents == 0 && f.marital != null) Set("household", Field.Of(Status.Proposed, f.marital == "married" ? "partner" : "none", true));
            if (f.debt == 0)
            {
                Set("mortgage", Field.Of(Status.Proposed, 0, true));
                Set("otherDebts", Field.Of(Status.Proposed, 0, true));
            }
            if (f.coverage == false) Set("existing", Field.Of(Status.Proposed, 0, true));
        }

        public static string NextStep(AppState state)
        {
            foreach (var st in STEPS) if ((st.when == null || st.when(state)) && !Has(state.profile, st.id)) return st.id;
            return null;
        }

        public static Question Ask(string stepId, AppState state)
        {
            var q = STEP[stepId].ask(state);
            return new Question { text = q.text, replies = q.replies.Append(WHY).ToList() };
        }

        public static List<string> Intro(AppState state)
        {
            var fromForm = state.profile.Values.Any(f => f.fromForm);
            return new List<string>
            {
                fromForm
                    ? $"Hi, I’m {GUIDE_NAME}! Thanks for answering those first questions. I won’t ask them again. I just have a few follow-ups, one at a time."
                    : $"Hi, I’m {GUIDE_NAME}! I’ll ask a few short questions about your household, one at a time.",
                "You can answer in your own words, tap a suggestion, or say “not sure.” Nothing is final until you review it.",
            };
        }

        public static string WhyText(string stepId) => STEP[stepId].why;

        static Reply Done(Step step, Val value, string extra, AppState state)
        {
            var updates = step.also?.Invoke(value, state) ?? new Dictionary<string, Field>();
            updates[step.id] = Field.Of(Status.Proposed, value);
            return new Reply { updates = updates, say = new List<string> { extra ?? step.ack(value, state) }, pendingSet = true, pending = null };
        }

        static Reply Say(string text) => new Reply { say = new List<string> { text } };

        // Read one user message for the current step.
        public static Reply Respond(string stepId, string text, AppState state) => Respond(stepId, text, state, false);

        static Reply Respond(string stepId, string text, AppState state, bool ignorePending)
        {
            var step = STEP[stepId];
            var trimmed = text.Trim();

            if (state.pending != null && !ignorePending)
            {
                var t = trimmed.ToLowerInvariant();
                var monthly = state.pending.Value;
                if (Regex.IsMatch(t, @"\b(yes|yep|monthly|month|correct|right)\b")) return Done(step, monthly * 12, $"Thanks. That’s {Calc.FormatMoney(monthly * 12)} a year.", state);
                if (Regex.IsMatch(t, @"\b(no|nope|yearly|year|annual)\b")) return Done(step, monthly, null, state);
                var again = Say($"Sorry, is {Calc.FormatMoney(monthly)} a monthly amount?");
                again.pendingSet = true;
                again.pending = monthly;
                again.replies = new List<string> { "Yes, monthly", "No, yearly" };
                return again;
            }

            if (Calc.IsWhy(trimmed)) { var r = Say(step.why); r.why = true; return r; }
            if (Calc.IsUnsure(trimmed))
            {
                var r = Say(step.optional
                    ? "No problem. We’ll leave it out for now, and you can add it during review."
                    : "No problem. I’ll mark it as “not sure,” and you can fill it in during review. We’ll need it before I can do the math.");
                r.updates = new Dictionary<string, Field> { [stepId] = Field.Unknown() };
                return r;
            }
            if (step.optional && Calc.IsSkip(trimmed))
            {
                var r = Say("Okay, we’ll leave that out of the math.");
                r.updates = new Dictionary<string, Field> { [stepId] = Field.Skipped() };
                return r;
            }

            return Settle(step, step.read(trimmed, state), state);
        }

        static Reply Settle(Step step, Read read, AppState state)
        {
            if (read.retry != null) { var r = Say(read.retry); r.replies = Ask(step.id, state).replies; return r; }
            if (read.clarify != null)
            {
                var c = read.clarify.Value;
                var r = Say($"Just to check: is {Calc.FormatMoney(c)} a month? That would be {Calc.FormatMoney(c * 12)} a year.");
                r.pendingSet = true;
                r.pending = c;
                r.replies = new List<string> { "Yes, monthly", "No, yearly" };
                return r;
            }
            return Done(step, read.value, null, state);
        }

        // The answers so far, sent with each question so the AI has context.
        public static Dictionary<string, object> Known(AppState state)
        {
            var facts = new Dictionary<string, object>();
            foreach (var f in Calc.FIELDS)
            {
                var field = Known(state.profile, f.id);
                if (field == null || !field.HasValue) continue;
                facts[f.id] = field.choice != null ? (object)field.choice : field.Number;
            }
            var total = DebtTotal(state);
            if (total != null) facts["totalDebt"] = total.Value;
            return facts;
        }

        const string AGAIN = "Sorry, I didn’t catch that. Could you say it another way?";

        // Turn the AI's reading into a Reply. Values go back through each step's own reader,
        // so the limits, the monthly check and the debt split apply exactly as they do for
        // the script. The AI's own words are shown only for explanations and re-asks; every
        // confirmation of an answer is the script's, so it can't disagree with the numbers.
        public static Reply Interpret(string stepId, Reading reading, AppState state, string typed = "")
        {
            var step = STEP[stepId];
            // A monthly amount is read by the script, which asks before turning it into a yearly one.
            var amount = Calc.ParseAmount(typed);
            if (reading.intent == "answer" && amount.kind == "amount" && amount.period == "month") return Respond(stepId, typed, state);
            var replies = Ask(stepId, state).replies;
            var said = (reading.say ?? "").Trim();

            if (reading.intent == "why" || (reading.intent == "question" && said == ""))
            {
                var why = Say(said != "" ? said : step.why);
                why.why = true;
                return why;
            }
            if (reading.intent == "unsure") return Respond(stepId, "not sure", state, true);
            if (reading.intent == "skip") return Respond(stepId, step.optional ? "skip" : "not sure", state, true);
            if (reading.intent != "answer") { var r = Say(said != "" ? said : AGAIN); r.replies = replies; return r; }

            string text = null;
            if (stepId == "household") { var label = Calc.HouseholdLabel(reading.household); text = label == "" ? null : label; }
            else if (reading.value != null) text = reading.value.Value + (reading.period == "month" ? " a month" : "");
            if (text == null) { var r = Say(AGAIN); r.replies = replies; return r; }

            var reply = Settle(step, step.read(text, state), state);
            if (reply.updates == null) return reply;

            // Other figures given in the same message fill empty fields only, and are named back.
            var noted = new List<string>();
            foreach (var kv in reading.extra)
            {
                if (!STEP.TryGetValue(kv.Key, out var other) || other.id == "household") continue;
                if (state.profile[other.id].status != Status.Empty || reply.updates.ContainsKey(other.id)) continue;
                var read = other.read(kv.Value.ToString(), state);
                if (!read.ok) continue;
                var more = other.also?.Invoke(read.value, state);
                if (more != null) foreach (var m in more) reply.updates[m.Key] = m.Value;
                reply.updates[other.id] = Field.Of(Status.Proposed, read.value);
                noted.Add($"{Calc.FIELD[other.id].label.ToLowerInvariant()} ({Calc.FormatField(other.id, reply.updates[other.id])})");
            }
            if (noted.Count > 0) reply.say.Add($"I also noted your {string.Join(" and ", noted)}. You can change anything during review.");
            return reply;
        }
    }
}
