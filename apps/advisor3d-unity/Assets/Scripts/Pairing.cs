// Pairing with a browser, so a chat started on the site can be spoken here. The site shows a
// QR code (and a six-digit code to type) holding a pairing id; the app loads the Basics answers
// saved under it, and saves what Abe learns back for the site to pick up
// (apps/backend/pairing.py, apps/web/src/intake/pair.ts). This file is the part with no Unity
// types: what the code holds, and the site's JSON shapes for a profile and the form.
using System;
using System.Collections.Generic;

namespace Advisor3D
{
    public static class Pairing
    {
        public const string QR_PREFIX = "LINCLIFE:";
        public const int ID_LENGTH = 26, CODE_LENGTH = 6;
        const string ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

        static readonly string[] STATUS = { "empty", "unknown", "skipped", "proposed", "confirmed" }; // in the order of Status

        // The pairing id in a scanned QR code, or null when the code is something else.
        public static string ReadQr(string text)
        {
            text = (text ?? "").Trim();
            if (!text.StartsWith(QR_PREFIX, StringComparison.Ordinal)) return null;
            var id = text.Substring(QR_PREFIX.Length);
            if (id.Length != ID_LENGTH) return null;
            foreach (var c in id) if (ID_ALPHABET.IndexOf(c) < 0) return null;
            return id;
        }

        // One answer as the site writes it: { status, value, source? }.
        public static Dictionary<string, object> Wire(Field field)
        {
            var wire = new Dictionary<string, object>
            {
                ["status"] = STATUS[(int)field.status],
                ["value"] = !field.IsSet ? null : field.choice != null ? field.choice : (object)field.num,
            };
            if (field.fromForm) wire["source"] = "form";
            return wire;
        }

        public static Dictionary<string, object> Wire(Profile profile)
        {
            var wire = new Dictionary<string, object>();
            foreach (var f in Calc.FIELDS) wire[f.id] = Wire(profile[f.id]);
            return wire;
        }

        public static Dictionary<string, object> Wire(Form form) => new Dictionary<string, object>
        {
            ["income"] = form.income, ["marital"] = form.marital, ["dependents"] = form.dependents,
            ["debt"] = form.debt, ["coverage"] = form.coverage,
        };

        // One answer from the site. Anything that does not fit the field is read as not answered.
        public static Field ReadField(string id, string status, long? number, string choice, bool fromForm)
        {
            var at = Array.IndexOf(STATUS, status);
            if (at < 0 || !Calc.FIELD.TryGetValue(id, out var def)) return Field.Empty();
            var s = (Status)at;
            if (s != Status.Proposed && s != Status.Confirmed) return new Field { status = s };
            if (def.kind == "choice")
            {
                foreach (var (key, _) in Calc.HOUSEHOLD) if (key == choice) return Field.Of(s, choice, fromForm);
                return Field.Empty();
            }
            return number >= 0 ? Field.Of(s, number.Value, fromForm) : Field.Empty();
        }

        // The six digits typed in the headset, or null while there are not six of them yet.
        public static string ReadCode(string digits)
        {
            if (digits == null || digits.Length != CODE_LENGTH) return null;
            foreach (var c in digits) if (c < '0' || c > '9') return null;
            return digits;
        }
    }
}
