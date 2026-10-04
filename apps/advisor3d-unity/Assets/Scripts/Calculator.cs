// Fields, parsing and the needs calculation. Pure functions, no UI.
// A C# port of advisor3d/src/domain/calculator.ts; keep the two in step.
// Model (simplified, for mentor review):
//   additional = max(0, support × years + mortgage + other debts + final expenses + education
//                       − existing coverage − savings)
// It leaves out inflation, investment returns, taxes and Social Security.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace Advisor3D
{
    // 'Unknown' is never treated as zero.
    public enum Status { Empty, Unknown, Skipped, Proposed, Confirmed }

    // One answer. A value is a number, or a household key for the one choice field.
    public class Field
    {
        public Status status;
        public long? num;
        public string choice;
        public bool fromForm;

        public static Field Empty() => new Field { status = Status.Empty };
        public static Field Unknown() => new Field { status = Status.Unknown };
        public static Field Skipped() => new Field { status = Status.Skipped };
        public static Field Of(Status status, long value, bool fromForm = false) => new Field { status = status, num = value, fromForm = fromForm };
        public static Field Of(Status status, string value, bool fromForm = false) => new Field { status = status, choice = value, fromForm = fromForm };
        public static Field Of(Status status, Val v, bool fromForm = false) => v.IsChoice ? Of(status, v.H, fromForm) : Of(status, v.N, fromForm);

        public bool IsSet => status == Status.Proposed || status == Status.Confirmed;
        public bool HasValue => IsSet && (num.HasValue || choice != null);
        public long Number => num ?? 0;
    }

    // A number or a household key, as the chat script passes answers around.
    public readonly struct Val
    {
        public readonly long N;
        public readonly string H;
        public Val(long n) { N = n; H = null; }
        public Val(string h) { N = 0; H = h; }
        public bool IsChoice => H != null;
        public static implicit operator Val(long n) => new Val(n);
        public static implicit operator Val(string h) => new Val(h);
    }

    public class Profile : Dictionary<string, Field>
    {
        public Profile() { }
        public Profile(Profile other) : base(other) { }
    }

    // role: required must be known before we estimate; optional can be left out of the math;
    // context is shown to the user but never used in the math.
    public class FieldDef { public string id, group, label, kind, role; }

    public class Term { public string id, label, detail; public long value; public bool optional, included; }

    public class Estimate
    {
        public bool ready;
        public List<string> missing = new List<string>();
        public List<Term> needs = new List<Term>(), resources = new List<Term>();
        public long totalNeeds, totalResources, additional;
        public List<string> leftOut = new List<string>();
    }

    public class ParsedAmount { public string kind; public long value; public string period; }
    public class ParsedCount { public string kind; public long value; }

    public static class Calc
    {
        public static readonly (string id, string title)[] GROUPS =
        {
            ("household", "Your household"),
            ("income", "Income your family would need"),
            ("debts", "Debts and final costs"),
            ("future", "Future goals"),
            ("resources", "What you already have"),
        };

        static FieldDef F(string id, string group, string label, string kind, string role) => new FieldDef { id = id, group = group, label = label, kind = kind, role = role };

        public static readonly FieldDef[] FIELDS =
        {
            F("household", "household", "Who depends on you", "choice", "context"),
            F("youngestAge", "household", "Youngest child’s age", "age", "context"),
            F("income", "income", "Your yearly income", "money", "context"),
            F("support", "income", "Yearly support needed", "money", "required"),
            F("years", "income", "Years of support", "years", "required"),
            F("mortgage", "debts", "Mortgage balance", "money", "required"),
            F("otherDebts", "debts", "Other debts", "money", "required"),
            F("finalExpenses", "debts", "Funeral and final expenses", "money", "optional"),
            F("education", "future", "Education or other future costs", "money", "optional"),
            F("existing", "resources", "Life insurance you already have", "money", "required"),
            F("savings", "resources", "Savings your family could use", "money", "optional"),
        };

        public static readonly Dictionary<string, FieldDef> FIELD = FIELDS.ToDictionary(f => f.id);

        // Ordered as the frontend lists them.
        public static readonly (string key, string label)[] HOUSEHOLD =
        {
            ("both", "My partner and kids"),
            ("partner", "My partner"),
            ("kids", "My kids"),
            ("others", "Parents or other family"),
            ("none", "No one right now"),
        };

        public static string HouseholdLabel(string key)
        {
            foreach (var (k, label) in HOUSEHOLD) if (k == key) return label;
            return "";
        }

        public static Profile EmptyProfile()
        {
            var p = new Profile();
            foreach (var f in FIELDS) p[f.id] = Field.Empty();
            return p;
        }

        static readonly Regex UNSURE = new Regex(@"\b(not sure|unsure|no idea|don'?t know|do not know|idk|dunno|maybe later)\b|^\?+$");
        static readonly Regex NONE = new Regex(@"^(none|no|nope|nothing|zero|n\/a|na|nah|\$?0+)\b|\b(don'?t have (any|one)|no (debts?|mortgage|insurance|coverage|savings))\b");
        static readonly Regex SKIP = new Regex(@"\b(skip|leave (it|that) out|pass)\b");
        static readonly Regex WHY = new Regex(@"\b(why|what does that mean|explain|what is that|what's that)\b");
        static readonly Regex AMOUNT = new Regex(@"(-)?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|grand|m|mil|million)?\b");
        static readonly Regex MONTH = new Regex(@"\b(a|per|each|every|\/)\s*(month|mo)\b|\bmonthly\b|\/mo\b");
        static readonly Regex YEAR = new Regex(@"\b(a|per|each|every|\/)\s*(year|yr)\b|\b(yearly|annual(ly)?)\b|\/yr\b");
        static readonly Regex COUNT = new Regex(@"-?\d+(\.\d+)?");

        static string Norm(string text) => (text ?? "").ToLowerInvariant().Trim();
        public static bool IsUnsure(string text) => UNSURE.IsMatch(Norm(text));
        public static bool IsSkip(string text) => SKIP.IsMatch(Norm(text));
        public static bool IsWhy(string text) => WHY.IsMatch((text ?? "").ToLowerInvariant());

        // JavaScript's Math.round: halves go up.
        static long Round(double v) => (long)Math.Floor(v + 0.5);

        // "75k", "$75,000", "1.2 million", "5,000 a month", "none", "not sure"
        public static ParsedAmount ParseAmount(string raw)
        {
            var text = Norm(raw);
            if (text.Length == 0) return new ParsedAmount { kind = "empty" };
            if (UNSURE.IsMatch(text)) return new ParsedAmount { kind = "unknown" };
            if (NONE.IsMatch(text)) return new ParsedAmount { kind = "amount", value = 0 };
            var m = AMOUNT.Match(text);
            if (!m.Success) return new ParsedAmount { kind = "none" };
            if (m.Groups[1].Success) return new ParsedAmount { kind = "negative" };
            var value = double.Parse(m.Groups[2].Value.Replace(",", ""), CultureInfo.InvariantCulture);
            var unit = m.Groups[3].Success ? m.Groups[3].Value : null;
            if (unit == "k" || unit == "thousand" || unit == "grand") value *= 1e3;
            if (unit == "m" || unit == "mil" || unit == "million") value *= 1e6;
            string period = null;
            if (MONTH.IsMatch(text)) period = "month";
            else if (YEAR.IsMatch(text)) period = "year";
            return new ParsedAmount { kind = "amount", value = Round(value), period = period };
        }

        // "10", "10 years". Anything vaguer gets asked again rather than guessed.
        public static ParsedCount ParseCount(string raw, long min, long max)
        {
            var text = Norm(raw);
            if (UNSURE.IsMatch(text)) return new ParsedCount { kind = "unknown" };
            var m = COUNT.Match(text);
            if (!m.Success) return new ParsedCount { kind = "none" };
            var n = Round(double.Parse(m.Value, CultureInfo.InvariantCulture));
            if (n < min || n > max) return new ParsedCount { kind = "range" };
            return new ParsedCount { kind = "amount", value = n };
        }

        public static string Grouped(long n) => n.ToString("N0", CultureInfo.InvariantCulture);
        public static string FormatMoney(long n) => "$" + Grouped(n);

        public static string FormatField(string id, Field field)
        {
            if (field == null || field.status == Status.Empty) return "";
            if (field.status == Status.Unknown) return "Not sure yet";
            if (field.status == Status.Skipped) return "Left out";
            var def = FIELD[id];
            if (def.kind == "choice") return HouseholdLabel(field.choice);
            var n = field.Number;
            if (def.kind == "money") return FormatMoney(n);
            if (def.kind == "years") return n + (n == 1 ? " year" : " years");
            return n + (n == 1 ? " year old" : " years old");
        }

        // Which required fields still block an estimate.
        public static List<string> MissingRequired(Profile profile) =>
            FIELDS.Where(f => f.role == "required" && !profile[f.id].HasValue).Select(f => f.id).ToList();

        static long Amount(Profile profile, string id) => profile[id].HasValue ? profile[id].Number : 0;

        // Returns every term shown on screen, so a screen never computes a number itself.
        public static Estimate Calculate(Profile profile)
        {
            var missing = MissingRequired(profile);
            if (missing.Count > 0) return new Estimate { ready = false, missing = missing };

            var support = Amount(profile, "support");
            var years = Amount(profile, "years");
            Term T(string id, string label, long value, bool optional = false, string detail = null) =>
                new Term { id = id, label = label, detail = detail, value = value, optional = optional, included = !optional || profile[id].HasValue };

            var e = new Estimate { ready = true };
            e.needs.Add(T("support", "Yearly support", support * years, false, $"{FormatMoney(support)} × {years} {(years == 1 ? "year" : "years")}"));
            e.needs.Add(T("mortgage", "Mortgage balance", Amount(profile, "mortgage")));
            e.needs.Add(T("otherDebts", "Other debts", Amount(profile, "otherDebts")));
            e.needs.Add(T("finalExpenses", "Funeral and final expenses", Amount(profile, "finalExpenses"), true));
            e.needs.Add(T("education", "Education or other future costs", Amount(profile, "education"), true));
            e.resources.Add(T("existing", "Life insurance you have", Amount(profile, "existing")));
            e.resources.Add(T("savings", "Savings your family could use", Amount(profile, "savings"), true));

            e.totalNeeds = e.needs.Where(t => t.included).Sum(t => t.value);
            e.totalResources = e.resources.Where(t => t.included).Sum(t => t.value);
            e.additional = Math.Max(0, e.totalNeeds - e.totalResources);
            e.leftOut = e.needs.Concat(e.resources).Where(t => !t.included).Select(t => t.label).ToList();
            return e;
        }

        public static string SummaryText(Profile profile, Estimate result)
        {
            var lines = new List<string> { "Life insurance needs estimate", "", "What I shared" };
            foreach (var f in FIELDS)
            {
                var v = FormatField(f.id, profile[f.id]);
                if (v != "") lines.Add($"- {f.label}: {v}");
            }
            lines.Add("");
            if (!result.ready)
            {
                lines.Add($"Estimate not ready. Still needed: {string.Join(", ", result.missing.Select(id => FIELD[id].label))}.");
                return string.Join("\n", lines);
            }
            lines.Add("The math");
            foreach (var t in result.needs.Where(t => t.included)) lines.Add($"+ {t.label}{(t.detail != null ? $" ({t.detail})" : "")}: {FormatMoney(t.value)}");
            foreach (var t in result.resources.Where(t => t.included)) lines.Add($"- {t.label}: {FormatMoney(t.value)}");
            lines.Add($"= Estimated additional coverage: {FormatMoney(result.additional)}");
            if (result.leftOut.Count > 0) lines.Add($"Left out: {string.Join(", ", result.leftOut)}.");
            lines.Add("");
            lines.Add("This is an estimate to start a conversation, not a quote or recommendation. It does not account for inflation, investment returns, taxes or Social Security.");
            return string.Join("\n", lines);
        }
    }
}
