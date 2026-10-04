// The site's tests, ported, so the C# calculator and chat script
// can be checked against the same cases (the site's tests are in apps/web/tests/). Run with: dotnet run --project Tests~
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Advisor3D;

static class Tests
{
    static int failed;
    static readonly List<(string name, Action run)> all = new List<(string, Action)>();

    static void Test(string name, Action run) => all.Add((name, run));
    static void Ok(bool condition, string what = "") { if (!condition) throw new Exception("expected true " + what); }
    static void Eq<TValue>(TValue actual, TValue expected)
    {
        if (!EqualityComparer<TValue>.Default.Equals(actual, expected)) throw new Exception($"expected {expected}, got {actual}");
    }
    static void Match(string text, string pattern) { if (!Regex.IsMatch(text, pattern, RegexOptions.Singleline)) throw new Exception($"\"{text}\" does not match /{pattern}/"); }

    // ---------- calculator ----------
    // A fictional sample household ($180,000 of debts split across two fields).
    static Profile Sample(params (string id, long value)[] overrides)
    {
        var p = Calc.EmptyProfile();
        void Set(string id, long value) => p[id] = Field.Of(Status.Confirmed, value);
        Set("support", 40000); Set("years", 10); Set("mortgage", 150000); Set("otherDebts", 30000);
        Set("education", 20000); Set("existing", 100000);
        p["finalExpenses"] = Field.Skipped();
        p["savings"] = Field.Skipped();
        foreach (var (id, v) in overrides) Set(id, v);
        return p;
    }

    static long Additional(Profile p)
    {
        var r = Calc.Calculate(p);
        Ok(r.ready);
        return r.additional;
    }

    static void Amount(string text, long value, string period)
    {
        var r = Calc.ParseAmount(text);
        Eq(r.kind, "amount");
        Eq(r.value, value);
        Eq(r.period, period);
    }

    // ---------- chat script ----------
    static AppState State(Form form = null)
    {
        var s = new AppState { form = form ?? new Form(), started = true };
        Script.ApplyForm(s);
        return s;
    }

    static int Main()
    {
        Test("sample household needs $500,000", () => Eq(Additional(Sample()), 500000));
        Test("eight years of support gives $420,000", () => Eq(Additional(Sample(("years", 8))), 420000));
        Test("more coverage than needs shows zero, not a negative", () => Eq(Additional(Sample(("existing", 2000000))), 0));
        Test("an unknown required value blocks the estimate", () =>
        {
            var p = Sample();
            p["mortgage"] = Field.Unknown();
            var r = Calc.Calculate(p);
            Eq(r.ready, false);
            Ok(r.missing.Count == 1 && r.missing[0] == "mortgage");
        });
        Test("skipped optional values are listed as left out", () =>
        {
            var r = Calc.Calculate(Sample());
            Ok(r.ready);
            Eq(string.Join("|", r.leftOut), "Funeral and final expenses|Savings your family could use");
        });
        Test("parses the ways people write amounts", () =>
        {
            Amount("$75,000", 75000, null);
            Amount("75k", 75000, null);
            Amount("about 1.2 million", 1200000, null);
            Amount("none", 0, null);
            Amount("$5,000 a month", 5000, "month");
            Eq(Calc.ParseAmount("not sure").kind, "unknown");
            Eq(Calc.ParseAmount("-500").kind, "negative");
            Eq(Calc.ParseAmount("a lot").kind, "none");
        });
        Test("years must be in range", () =>
        {
            var r = Calc.ParseCount("15 years", 1, 70);
            Eq(r.kind, "amount");
            Eq(r.value, 15);
            Eq(Calc.ParseCount("90", 1, 70).kind, "range");
        });
        // ---------- looking ahead ----------
        // The same cases as apps/web/tests/calculator.test.ts and apps/backend/tests/test_recommendations.py.
        Outlook Ahead(Profile p) { var o = Calc.Outlook(p, Calc.Calculate(p)); Ok(o.ready); return o; }
        Test("no outlook until a look-ahead question is answered, and today's estimate never moves", () =>
        {
            Ok(!Calc.Outlook(Sample(), Calc.Calculate(Sample())).ready);
            Eq(Additional(Sample(("income", 50000), ("futureIncome", 100000), ("plans", 2))), 500000);
        });
        Test("a higher income keeps support's share, and a home is three times income", () =>
        {
            var o = Ahead(Sample(("income", 50000), ("futureIncome", 100000), ("plans", 2)));
            Eq((o.support, o.years, o.mortgage, o.additional, o.change), (80000L, 10L, 300000L, 1050000L, 550000L));
            Eq(string.Join(",", o.drivers.Select(d => d.id + "=" + d.delta)), "income=400000,home=150000");
        });
        Test("someone starting out: kids and a home on a future income", () =>
        {
            var p = Sample(("income", 13000), ("futureIncome", 60000), ("plans", 3), ("support", 0), ("years", 1), ("mortgage", 0), ("otherDebts", 8000), ("education", 0), ("existing", 0));
            Eq(Additional(p), 8000);
            var o = Ahead(p);
            Eq((o.support, o.years, o.mortgage, o.additional), (42000L, 20L, 180000L, 1078000L));
            Eq(string.Join(",", o.drivers.Select(d => d.id + "=" + d.delta)), "kids=890000,home=180000");
        });
        Test("a partner, no changes, and a lower income", () =>
        {
            var partner = Ahead(Sample(("income", 60000), ("plans", 4)));
            Eq((partner.support, partner.years, partner.additional), (42000L, 10L, 520000L));
            var same = Ahead(Sample(("income", 50000), ("futureIncome", 50000), ("plans", 0)));
            Eq((same.drivers.Count, same.change, same.additional), (0, 0L, 500000L));
            var lower = Ahead(Sample(("income", 50000), ("futureIncome", 25000)));
            Eq((lower.support, lower.additional, lower.drivers[0].delta), (20000L, 300000L, -200000L));
        });
        Test("plans and percents read back as the site writes them", () =>
        {
            Eq(Calc.FormatPlans(0), "None of these");
            Eq(Calc.FormatPlans(3), "Kids and a home");
            Eq(Calc.FormatPlans(7), "Kids, a home and a partner");
            Eq(Calc.FormatField("plans", Field.Of(Status.Confirmed, 6)), "A home and a partner");
            Eq(Calc.FormatPercent(0, 600000), "0%");
            Eq(Calc.FormatPercent(2500, 600000), "0.4%");
            Eq(Calc.FormatPercent(100, 600000), "under 0.1%");
            Eq(Calc.FormatPercent(100000, 600000), "17%");
            Eq(Calc.FormatPercent(597500, 600000), "99.6%");
            Eq(Calc.FormatPercent(900000, 600000), "100%");
        });

        Test("the summary and the sample family agree with the web app", () =>
        {
            Store.LoadSample();
            var r = Calc.Calculate(Store.State.profile);
            // 60,000 × 18 + 240,000 + 40,000 + 12,000 + 50,000 − 150,000 − 60,000
            Eq(r.totalNeeds, 1422000);
            Eq(r.totalResources, 210000);
            Eq(r.additional, 1212000);
            Match(Calc.SummaryText(Store.State.profile, r), @"\+ Yearly support \(\$60,000 × 18 years\): \$1,080,000");
        });

        Test("form answers prefill the profile as proposed, not confirmed", () =>
        {
            var s = State(new Form { income = 75000, marital = "married", dependents = 0, debt = 0, coverage = false });
            Eq(s.profile["income"].status, Status.Proposed);
            Eq(s.profile["income"].num, 75000);
            Ok(s.profile["income"].fromForm);
            Eq(s.profile["household"].choice, "partner");
            Eq(s.profile["mortgage"].num, 0);
            Eq(s.profile["otherDebts"].num, 0);
            Eq(s.profile["existing"].num, 0);
        });
        Test("skipped form answers stay empty, never zero", () =>
        {
            var s = State(new Form { coverage = true });
            Eq(s.profile["income"].status, Status.Empty);
            Eq(s.profile["mortgage"].status, Status.Empty);
            Eq(s.profile["existing"].status, Status.Empty);
            Eq(Script.NextStep(s), "household");
        });
        Test("with dependents, Pip still asks who they are", () =>
        {
            var s = State(new Form { marital = "single", dependents = 2 });
            Eq(s.profile["household"].status, Status.Empty);
        });
        Test("mortgage answer splits the form total into mortgage and other debts", () =>
        {
            var r = Script.Respond("mortgage", "150k", State(new Form { debt = 180000 }));
            Eq(r.updates["mortgage"].num, 150000);
            Eq(r.updates["otherDebts"].num, 30000);
        });
        Test("\"all of it\" puts the whole total on the mortgage", () =>
        {
            var r = Script.Respond("mortgage", "All of it", State(new Form { debt = 180000 }));
            Eq(r.updates["mortgage"].num, 180000);
            Eq(r.updates["otherDebts"].num, 0);
        });
        Test("a mortgage above the total asks again", () =>
        {
            var r = Script.Respond("mortgage", "200,000", State(new Form { debt = 180000 }));
            Ok(r.updates == null);
            Ok(r.replies != null);
        });
        Test("\"not sure\" about the mortgage leaves other debts for Pip to ask", () =>
        {
            var r = Script.Respond("mortgage", "not sure", State(new Form { debt = 180000 }));
            Eq(r.updates["mortgage"].status, Status.Unknown);
            Ok(!r.updates.ContainsKey("otherDebts"));
        });
        Test("re-running the form updates its own answers but not confirmed ones", () =>
        {
            var s = State(new Form { income = 75000 });
            s.profile["income"] = Field.Of(Status.Confirmed, 75000, true);
            s.form.income = 90000;
            Script.ApplyForm(s);
            Eq(s.profile["income"].num, 75000);
            var unconfirmed = State(new Form { income = 75000 });
            unconfirmed.form.income = 90000;
            Script.ApplyForm(unconfirmed);
            Eq(unconfirmed.profile["income"].num, 90000);
        });
        Test("a monthly income is checked, then turned into a yearly one", () =>
        {
            var s = State();
            var r = Script.Respond("income", "5,000 a month", s);
            Eq(r.pending, 5000);
            Ok(r.updates == null);
            s.pending = r.pending;
            var yes = Script.Respond("income", "Yes, monthly", s);
            Eq(yes.updates["income"].num, 60000);
            Ok(yes.pendingSet && yes.pending == null);
        });
        Test("the whole scripted chat reaches the closing line", () =>
        {
            var s = State(new Form { income = 85000, marital = "married", dependents = 2, debt = 280000, coverage = true });
            var answers = new Dictionary<string, string>
            {
                ["household"] = "My partner and kids", ["youngestAge"] = "5", ["support"] = "$60,000", ["years"] = "17 years", ["mortgage"] = "$240,000",
                ["finalExpenses"] = "$10,000", ["education"] = "Skip this", ["existing"] = "$150,000", ["savings"] = "None",
                ["plans"] = "Kids and a home", ["futureIncome"] = "About the same",
            };
            var asked = new List<string>();
            for (var step = Script.NextStep(s); step != null; step = Script.NextStep(s))
            {
                asked.Add(step);
                Ok(asked.Count < 20, "the chat did not end");
                Ok(Script.Ask(step, s).replies.Last() == Script.WHY);
                var r = Script.Respond(step, answers[step], s);
                Ok(r.updates != null, step);
                foreach (var kv in r.updates) s.profile[kv.Key] = kv.Value;
            }
            // Income came from the form, and the mortgage answer settled the other debts.
            // The two look-ahead questions come last, after everything about today.
            Eq(string.Join(",", asked), "household,youngestAge,support,years,mortgage,finalExpenses,education,existing,savings,plans,futureIncome");
            Eq(s.profile["plans"].num, 3);
            Eq(s.profile["futureIncome"].num, 85000);
            Eq(s.profile["otherDebts"].num, 40000);
            Eq(s.profile["education"].status, Status.Skipped);
            Ok(Calc.Calculate(s.profile).ready);
        });

        // The AI's reading of a spoken or typed answer goes through the same checks as the script.
        Test("plans are read from taps and from plain words, and a ruled-out plan is not counted", () =>
        {
            var s = State(new Form { income = 13000, age = 21 });
            long? Plans(string text) => Script.Respond("plans", text, s).updates?["plans"].num;
            Eq(Plans("Kids"), 1);
            Eq(Plans("Buying a home"), 2);
            Eq(Plans("Kids and a home"), 3);
            Eq(Plans("Getting married"), 4);
            Eq(Plans("None of these"), 0);
            Eq(Plans("we want a baby, a house, and the wedding is in June"), 7);
            Eq(Plans("no kids but we are buying a house"), 2);
            Eq(Plans("no more kids"), 0);
            Eq(Script.Respond("plans", "Skip this", s).updates["plans"].status, Status.Skipped);
            Ok(Script.Respond("plans", "a boat", s).updates == null);
            foreach (var chip in Script.Ask("plans", s).replies.Where(r => r != Script.WHY)) Ok(Script.Respond("plans", chip, s).updates != null, chip);
        });
        Test("expected income takes a figure, or a phrase read against today's income", () =>
        {
            var s = State(new Form { income = 13000, age = 21 });
            long? Future(string text) => Script.Respond("futureIncome", text, s).updates?["futureIncome"].num;
            Eq(Future("About the same"), 13000);
            Eq(Future("probably double"), 26000);
            Eq(Future("60k once I graduate"), 60000);
            Eq(Future("about the same, maybe 15k"), 15000);
            Ok(Script.Respond("futureIncome", "a lot more", s).updates == null);
            // Bigger steps are suggested early in a career.
            Eq(string.Join("|", Script.Ask("futureIncome", s).replies.Take(3)), "About the same|$26,000|$52,000");
            Eq(string.Join("|", Script.Ask("futureIncome", State(new Form { income = 80000, age = 45 })).replies.Take(3)), "About the same|$100,000|$120,000");
            // Not asked at all when today's income is unknown.
            var unknown = State();
            foreach (var f in Calc.FIELDS) if (f.id != "plans" && f.id != "futureIncome") unknown.profile[f.id] = Field.Unknown();
            unknown.profile["plans"] = Field.Skipped();
            Eq(Script.NextStep(unknown), null);
        });
        Test("the AI's reading of plans and expected income goes through the script's readers", () =>
        {
            var s = State(new Form { income = 13000 });
            Eq(Script.Interpret("plans", new Reading { value = 3 }, s).updates["plans"].num, 3);
            Eq(Script.Interpret("plans", new Reading { value = 0 }, s).updates["plans"].num, 0);
            Eq(Script.Interpret("futureIncome", new Reading { value = 70000 }, s).updates["futureIncome"].num, 70000);
            Eq(Script.Interpret("futureIncome", new Reading { intent = "unclear", say = "One number, please." }, s, "double").updates["futureIncome"].num, 26000);
            Ok(Script.Interpret("plans", new Reading { intent = "unclear" }, s, "a boat").updates == null);
        });
        Test("plans and expected income by voice", () =>
        {
            var s = State(new Form { income = 13000 });
            var (updates, tell) = VoiceScript.Save(new Dictionary<string, long> { ["plans"] = 3, ["futureIncome"] = 60000 }, null, null, null, s);
            Eq(updates["plans"].num, 3);
            Eq(updates["futureIncome"].num, 60000);
            Match(tell, "Changes you expect: Kids and a home");
            // Expected income is read against today's, so it waits for that.
            var (none, wait) = VoiceScript.Save(new Dictionary<string, long> { ["futureIncome"] = 60000 }, null, null, null, State());
            Ok(none == null);
            Match(wait, "find out what they earn now first");
            Ok(VoiceScript.TOOLS.Contains("\"plans\"") && VoiceScript.INSTRUCTIONS.Contains("futureIncome"));
        });
        Test("the headset sends the look-ahead answers and the age back to the site", () =>
        {
            var wire = Pairing.Wire(new Form { age = 21, income = 13000 });
            Eq((long?)wire["age"], 21);
            Eq(Pairing.ReadField("plans", "confirmed", 3, null, false).num, 3);
            Eq(Pairing.ReadField("futureIncome", "proposed", 60000, null, false).num, 60000);
        });

        Test("an AI reading becomes a proposed answer with the script's own confirmation", () =>
        {
            var r = Script.Interpret("income", new Reading { value = 80000, say = "Got it, $90,000!" }, State());
            Eq(r.updates["income"].status, Status.Proposed);
            Eq(r.updates["income"].num, 80000);
            Eq(string.Join("|", r.say), "Thanks, $80,000 a year.");
            Eq(Script.Interpret("household", new Reading { household = "both" }, State()).updates["household"].choice, "both");
        });
        Test("a monthly amount from the AI is checked, not multiplied silently", () =>
        {
            var r = Script.Interpret("income", new Reading { value = 6000, period = "month" }, State());
            Ok(r.updates == null);
            Eq(r.pending, 6000);
            // Even if the AI already multiplied it, the typed monthly amount is what gets checked.
            var m = Script.Interpret("income", new Reading { value = 72000 }, State(), "about 6k a month");
            Ok(m.updates == null);
            Eq(m.pending, 6000);
        });
        Test("AI values outside the limits ask again", () =>
        {
            Ok(Script.Interpret("years", new Reading { value = 500 }, State()).updates == null);
            Ok(Script.Interpret("income", new Reading { value = -1 }, State()).updates == null);
            Ok(Script.Interpret("mortgage", new Reading { value = 200000 }, State(new Form { debt = 180000 })).updates == null);
            Ok(Script.Interpret("income", new Reading(), State()).updates == null);
            Ok(Script.Interpret("household", new Reading { household = "pets" }, State()).updates == null);
        });
        Test("extra figures fill empty fields only and are named back", () =>
        {
            var s = State(new Form { debt = 300000 });
            s.profile["existing"] = Field.Of(Status.Confirmed, 50000);
            var reading = new Reading { value = 90000 };
            reading.extra["mortgage"] = 250000; reading.extra["existing"] = 1; reading.extra["years"] = 500; reading.extra["household"] = 3;
            var r = Script.Interpret("income", reading, s);
            Eq(r.updates["mortgage"].num, 250000);
            Eq(r.updates["otherDebts"].num, 50000);
            Ok(!r.updates.ContainsKey("existing") && !r.updates.ContainsKey("years") && !r.updates.ContainsKey("household"));
            Match(r.say[1], @"mortgage balance \(\$250,000\)");
        });
        Test("unsure, skip, why and side questions from the AI", () =>
        {
            Eq(Script.Interpret("support", new Reading { intent = "unsure" }, State()).updates["support"].status, Status.Unknown);
            Eq(Script.Interpret("savings", new Reading { intent = "skip" }, State()).updates["savings"].status, Status.Skipped);
            // A required question can't be skipped; it's marked "not sure" instead.
            Eq(Script.Interpret("support", new Reading { intent = "skip" }, State()).updates["support"].status, Status.Unknown);
            Ok(Script.Interpret("income", new Reading { intent = "why" }, State()).why);
            var q = Script.Interpret("existing", new Reading { intent = "question", say = "Term covers a set number of years, like 20." }, State());
            Ok(q.updates == null);
            Eq(string.Join("|", q.say), "Term covers a set number of years, like 20.");
            Ok(q.replies.Count > 0);
        });
        Test("Known() lists answered fields and the form's total debt", () =>
        {
            var known = Script.Known(State(new Form { income = 75000, debt = 180000 }));
            Eq(string.Join(",", known.Select(kv => kv.Key + "=" + kv.Value)), "income=75000,totalDebt=180000");
        });

        Test("the support suggestion never offers the same figure twice", () =>
        {
            Question Ask(long income)
            {
                var s = State(new Form { income = income });
                s.profile["household"] = Field.Of(Status.Proposed, "none");
                Eq(Script.NextStep(s), "support");
                return Script.Ask("support", s);
            }
            var small = Ask(5000);
            Match(small.text, @"about \$3,500 to \$4,000\.");
            Eq(string.Join("|", small.replies), "$3,500|$4,000|Not sure|" + Script.WHY);
            var tiny = Ask(100);
            Match(tiny.text, @"about \$100\.$");
            Eq(tiny.replies.Count(r => r == "$100"), 1);
            Match(Ask(90000).text, @"about \$63,000 to \$72,000\.");
        });

        // ---------- pairing with a browser ----------
        Test("a pairing code is read from the site's QR code and nothing else", () =>
        {
            Eq(Pairing.ReadQr("LINCLIFE:0123456789ABCDEFGHJKMNPQRS"), "0123456789ABCDEFGHJKMNPQRS");
            Eq(Pairing.ReadQr(" LINCLIFE:0123456789ABCDEFGHJKMNPQRS\n"), "0123456789ABCDEFGHJKMNPQRS");
            foreach (var other in new[] { null, "", "https://codelinc.codehawks.org", "LINCLIFE:", "LINCLIFE:SHORT", "linclife:0123456789ABCDEFGHJKMNPQRS",
                "LINCLIFE:0123456789ABCDEFGHJKMNPQRSX", "LINCLIFE:0123456789ABCDEFGHIJKLMNOP", "LINCLIFE:0123456789abcdefghjkmnpqrs" })
                Eq(Pairing.ReadQr(other), null);
            Eq(Pairing.ReadCode("012345"), "012345");
            foreach (var other in new[] { null, "", "12345", "1234567", "12345a" }) Eq(Pairing.ReadCode(other), null);
        });

        Test("answers travel to the site and back in its own shapes", () =>
        {
            var s = State(new Form { income = 85000, marital = "married", dependents = 2, debt = 280000, coverage = true });
            s.profile["household"] = Field.Of(Status.Proposed, "both");
            s.profile["years"] = Field.Unknown();
            s.profile["savings"] = Field.Skipped();
            var wire = Pairing.Wire(s.profile);
            Eq(wire.Count, Calc.FIELDS.Length);
            var income = (Dictionary<string, object>)wire["income"];
            Eq((string)income["status"], "proposed");
            Eq((long?)income["value"], 85000);
            Eq((string)income["source"], "form");
            var household = (Dictionary<string, object>)wire["household"];
            Eq((string)household["value"], "both");
            Ok(!household.ContainsKey("source"));
            var years = (Dictionary<string, object>)wire["years"];
            Eq((string)years["status"], "unknown");
            Eq(years["value"], null);
            Eq((string)((Dictionary<string, object>)wire["support"])["status"], "empty");
            var form = Pairing.Wire(s.form);
            Eq((long?)form["debt"], 280000);
            Eq((string)form["marital"], "married");
            Eq((bool?)form["coverage"], true);

            var back = Pairing.ReadField("income", "proposed", 85000, null, true);
            Ok(back.status == Status.Proposed && back.num == 85000 && back.fromForm);
            var who = Pairing.ReadField("household", "confirmed", null, "kids", false);
            Ok(who.status == Status.Confirmed && who.choice == "kids");
            Eq(Pairing.ReadField("years", "unknown", null, null, false).status, Status.Unknown);
            Eq(Pairing.ReadField("savings", "skipped", 5, null, false).num, null);
            // Anything that does not fit the field is read as not answered, never as zero.
            Eq(Pairing.ReadField("household", "proposed", null, "everyone", false).status, Status.Empty);
            Eq(Pairing.ReadField("household", "proposed", 3, null, false).status, Status.Empty);
            Eq(Pairing.ReadField("income", "proposed", null, "lots", false).status, Status.Empty);
            Eq(Pairing.ReadField("income", "proposed", -5, null, false).status, Status.Empty);
            Eq(Pairing.ReadField("income", "sideways", 5, null, false).status, Status.Empty);
            Eq(Pairing.ReadField("notes", "proposed", 5, null, false).status, Status.Empty);
        });

        // ---------- voice ----------
        Test("the voice briefing names what is known and what to find out next", () =>
        {
            var s = State(new Form { income = 75000 });
            var b = VoiceScript.Briefing(s);
            Ok(b.StartsWith(VoiceScript.APP));
            Match(b, @"Your yearly income: \$75,000");
            Ok(b.Contains(Script.Ask("household", s).text));
            s.profile["household"] = Field.Of(Status.Proposed, "kids");
            Ok(VoiceScript.TakenBack(s).Contains(Script.Ask("youngestAge", s).text));
            Store.LoadSample();
            Match(VoiceScript.Briefing(Store.State), "Everything is collected");
            Match(VoiceScript.TakenBack(Store.State), "Everything is collected");
        });
        Test("several spoken answers are saved in one go", () =>
        {
            var s = State();
            var (updates, tell) = VoiceScript.Save(new Dictionary<string, long> { ["income"] = 90000, ["mortgage"] = 250000, ["youngestAge"] = 4 }, "both", null, null, s);
            Eq(updates["household"].choice, "both");
            Eq(updates["income"].num, 90000);
            Eq(updates["mortgage"].num, 250000);
            Eq(updates["youngestAge"].num, 4);
            Match(tell, @"^Saved: .*\$250,000");
            Match(tell, @"Next, find out: .*\(support\)");
            Ok(!tell.Contains("Could not save"));
        });
        Test("a grown youngest child is accepted, not bounced", () =>
        {
            var s = State();
            s.profile["household"] = Field.Of(Status.Proposed, "kids");
            var (updates, tell) = VoiceScript.Save(new Dictionary<string, long> { ["youngestAge"] = 50 }, null, null, null, s);
            Eq(updates["youngestAge"].status, Status.Skipped);
            Match(tell, "^Saved: Youngest child is an adult");
            Ok(!tell.Contains("between 0 and 30") && !tell.Contains("Could not save"));
            Match(tell, "Next, find out");
        });
        Test("a value the script rejects is kept out, and a correction replaces an earlier answer", () =>
        {
            var s = State();
            s.profile["household"] = Field.Of(Status.Proposed, "none");
            var (none, tell) = VoiceScript.Save(new Dictionary<string, long> { ["years"] = 500 }, null, null, null, s);
            Ok(none == null);
            Match(tell, "^Nothing was saved\\. Could not save: Years of support");
            s.profile["mortgage"] = Field.Of(Status.Proposed, 240000);
            var (fixedUp, said) = VoiceScript.Save(new Dictionary<string, long> { ["mortgage"] = 200000 }, null, null, null, s);
            Eq(fixedUp["mortgage"].num, 200000);
            Match(said, @"Mortgage balance: \$200,000");
        });
        Test("not sure, leave out, and the last answer by voice", () =>
        {
            var s = State();
            s.profile["household"] = Field.Of(Status.Proposed, "none");
            var (nothing, reply) = VoiceScript.Save(new Dictionary<string, long>(), null, null, null, s);
            Ok(nothing == null);
            Match(reply, "^They gave no new answer.*Next, find out");
            var (updates, _) = VoiceScript.Save(null, null, new[] { "income", "nonsense" }, new[] { "savings" }, s);
            Eq(updates["income"].status, Status.Unknown);
            Eq(updates["savings"].status, Status.Skipped);
            Store.LoadSample();
            var done = Store.State;
            done.profile["savings"] = Field.Empty();
            var (last, tell) = VoiceScript.Save(new Dictionary<string, long> { ["savings"] = 60000 }, null, null, null, done);
            Eq(last["savings"].num, 60000);
            Match(tell, "Everything is collected");
        });
        Test("a spoken answer is saved and the model is told the next question", () =>
        {
            var s = State(new Form { income = 75000 });
            var (reply, tell) = VoiceScript.Record(new Reading { household = "kids" }, "just my kids", s);
            Eq(reply.updates["household"].choice, "kids");
            Match(tell, "^Saved\\.");
            Ok(tell.Contains("Then ask: \"" + Script.Ask("youngestAge", s).text.Substring(0, 12)));
        });
        Test("a spoken value the script rejects is not saved", () =>
        {
            var s = State();
            s.profile["household"] = Field.Of(Status.Proposed, "kids");
            var (reply, tell) = VoiceScript.Record(new Reading { value = 500 }, "five hundred", s);
            Ok(reply.updates == null);
            Match(tell, "^Not saved yet\\..*between 0 and 30");
            var (none, missing) = VoiceScript.Record(new Reading(), "um", s);
            Ok(none.updates == null);
            Match(missing, "^Not saved yet");
        });
        Test("a baby under one is age 0 even when the model says not sure", () =>
        {
            foreach (var heard in new[] { "Under one.", "she's six months", "less than a year old", "a newborn" })
            {
                var s = State();
                s.profile["household"] = Field.Of(Status.Proposed, "kids");
                var (reply, tell) = VoiceScript.Record(new Reading { intent = "unsure" }, heard, s);
                Eq(reply.updates["youngestAge"].status, Status.Proposed);
                Eq(reply.updates["youngestAge"].num, 0);
                Match(tell, "^Saved");
            }
            var unsure = State();
            unsure.profile["household"] = Field.Of(Status.Proposed, "kids");
            Eq(VoiceScript.Record(new Reading { intent = "unsure" }, "I'm not sure", unsure).reply.updates["youngestAge"].status, Status.Unknown);
            Eq(VoiceScript.Record(new Reading { value = 4 }, "he's four, well four and two months", unsure).reply.updates["youngestAge"].num, 4);
        });
        Test("a spoken monthly amount is checked before it is saved", () =>
        {
            var s = State();
            s.profile["household"] = Field.Of(Status.Proposed, "none");
            Eq(Script.NextStep(s), "income");
            var (ask, tell) = VoiceScript.Record(new Reading { value = 6000, period = "month" }, "six thousand a month", s);
            Ok(ask.updates == null);
            Eq(ask.pending, 6000);
            Match(tell, "call record_answer again");
            s.pending = ask.pending;
            var (yes, said) = VoiceScript.Record(new Reading(), "yes, monthly", s);
            Eq(yes.updates["income"].num, 72000);
            Match(said, "^Saved\\.");
        });
        Test("unsure and the last answer by voice", () =>
        {
            var s = State();
            s.profile["household"] = Field.Of(Status.Proposed, "none");
            Eq(VoiceScript.Record(new Reading { intent = "unsure" }, "no idea", s).reply.updates["income"].status, Status.Unknown);
            Store.LoadSample();
            var done = Store.State;
            done.profile["savings"] = Field.Empty();
            var (last, tell) = VoiceScript.Record(new Reading { value = 60000 }, "sixty thousand", done);
            Eq(last.updates["savings"].num, 60000);
            Ok(tell.Contains(Script.CLOSING) && !tell.Contains("Then ask"));
            done.profile["savings"] = last.updates["savings"];
            var (none, nothing) = VoiceScript.Record(new Reading { value = 1 }, "one", done);
            Ok(none == null);
            Match(nothing, "^Nothing was saved");
        });

        foreach (var (name, run) in all)
        {
            try { run(); Console.WriteLine("ok   " + name); }
            catch (Exception e) { failed++; Console.WriteLine("FAIL " + name + "\n     " + e.Message); }
        }
        Console.WriteLine(failed == 0 ? $"\n{all.Count} passed" : $"\n{failed} of {all.Count} failed");
        return failed == 0 ? 0 : 1;
    }
}
