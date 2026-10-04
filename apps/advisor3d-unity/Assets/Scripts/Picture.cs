// The ring: a low circular table around the wearer that turns their answers into things in the
// room. This is the part of the assessment that only works in a headset: you stand inside it.
//
// - In front, under the panels, each amount the family would need (berry tones) and each
//   resource they already have (teal, green) is a block that rises as the answer is given.
// - The rest of the circle, round to the sides and behind, is the years of support: one post
//   per year. On Results the posts become the charts from the site's slide deck
//   (apps/web/src/results/charts.tsx): a staircase climbing as the cost adds up year by
//   year, and one stepping down as each passing year leaves one less to cover.
//
// It hangs off the rig, so it stays put under the panels. Every number is the wearer's own answer
// or comes from Calc.Calculate; nothing here does the estimate's math.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Advisor3D
{
    public class Picture
    {
        public const float R = 1.5f, Y = 0.45f;                 // the table: meters from the wearer, and above the floor
        const float FRONT = 58;                                 // degrees either side of straight ahead kept for the blocks
        const float BLOCK = 0.15f, BLOCK_MAX = 0.28f;           // a block's footprint, and the tallest one
        const float POST_LOW = 0.07f, POST_MAX = 0.85f;
        public const int MAX_YEARS = 70;

        // Left to right in front of the wearer: what the family would need, then what is already there.
        static readonly (string id, float angle)[] BLOCKS =
        {
            ("support", -48), ("mortgage", -32), ("otherDebts", -16), ("finalExpenses", 0), ("education", 16), ("existing", 32), ("savings", 48),
        };
        static readonly Color NEED = Ui.C("#9b2d5a"); // the site's chart color for "would need"

        class Block { public string id; public Transform mesh; public Sign sign; public float h, target; }
        class Sign { public Panel panel; public El el; public string title = "", value = "", shown; public Color? color; }

        // What the year posts show: "low" (one small post a year), "up" (the cost adding up), "down" (the years
        // still ahead), "ahead" (the years of support there could be in ten years, from Ahead).
        public static string Years = "low";
        public static Outlook Ahead;
        public static bool ShowBlocks = true;

        readonly Transform group, front, back;
        readonly List<Block> blocks = new List<Block>();
        readonly Transform[] posts = new Transform[MAX_YEARS];
        readonly float[] postH = new float[MAX_YEARS];
        readonly Sign first, last, total;
        readonly List<Material> materials = new List<Material>();
        readonly Dictionary<string, Color> colors;
        float shown; // 0 hidden .. 1 fully up, for the whole ring

        public Picture(Transform parent, Dictionary<string, Color> termColors)
        {
            colors = termColors;
            group = new GameObject("Picture").transform;
            group.SetParent(parent, false);
            group.localPosition = new Vector3(0, Y, 0);

            // The table top: a pale band with the brand's orange line along its inner edge.
            Mat.Spawn("Table", MeshGen.Ring(R - 0.17f, R + 0.17f), Keep(Mat.Unlit(new Color(1, 1, 1, 0.9f), transparent: true, twoSided: true)), group);
            Mat.Spawn("Line", MeshGen.Torus(R - 0.17f, 0.004f, upright: false, across: 8), Keep(Mat.Unlit(T.highlight)), group).localPosition = new Vector3(0, 0.002f, 0);

            front = new GameObject("Blocks").transform;
            front.SetParent(group, false);
            foreach (var (id, angle) in BLOCKS)
            {
                var b = new Block { id = id, mesh = Mat.Spawn(id, MeshGen.UnitBox(), Keep(Mat.Lit(colors[id])), front) };
                b.mesh.localRotation = Quaternion.Euler(0, angle, 0);
                b.sign = MakeSign(front, angle, R - 0.25f, 0.03f, lean: 50);
                b.sign.title = Calc.FIELD[id].label;
                blocks.Add(b);
            }

            back = new GameObject("Years").transform;
            back.SetParent(group, false);
            var post = Keep(Mat.Lit(NEED));
            for (var i = 0; i < MAX_YEARS; i++) posts[i] = Mat.Spawn("Year", MeshGen.UnitBox(), post, back);
            first = MakeSign(back, 0, R - 0.25f, 0.03f, lean: 50);
            last = MakeSign(back, 0, R - 0.25f, 0.03f, lean: 50);
            total = MakeSign(back, 0, R, 0, lean: 8);
            total.color = NEED;
            group.gameObject.SetActive(false);
        }

        Material Keep(Material m) { materials.Add(m); return m; }

        static Vector3 At(float degrees, float radius, float y = 0)
        {
            var a = degrees * Mathf.Deg2Rad;
            return new Vector3(Mathf.Sin(a) * radius, y, Mathf.Cos(a) * radius);
        }

        // A small card on the table, facing the wearer. lean: degrees tipped back, to be read from above.
        static Sign MakeSign(Transform parent, float angle, float radius, float y, float lean)
        {
            var s = new Sign { panel = new Panel(230, 62, parent, card: false) };
            s.panel.group.localScale = Vector3.one * 0.9f;
            Place(s, angle, radius, y, lean);
            s.el = s.panel.Add(new El(230, 62, ctx =>
            {
                ctx.Rect(0, 0, 230, 62, 16, Ui.C(255, 255, 255, 0.94f));
                ctx.Text(Ui.Wrap(s.title, Ui.Font(500, 14), 214)[0], 115, 8, Ui.Font(500, 14), T.label2, lineH: 18, align: Align.Center);
                ctx.Text(s.value, 115, 27, Ui.Font(700, 22), s.color ?? T.label, lineH: 28, align: Align.Center);
            }), 0, 0);
            return s;
        }

        static void Place(Sign s, float angle, float radius, float y, float lean)
        {
            s.panel.group.localPosition = At(angle, radius, y);
            s.panel.group.localRotation = Quaternion.Euler(0, angle, 0) * Quaternion.Euler(lean, 0, 0);
        }

        static void Write(Sign s, string title, string value)
        {
            var key = title + "\u0001" + value;
            if (key == s.shown) return;
            s.shown = key;
            s.title = title;
            s.value = value;
            s.el.Redraw();
        }

        // Called every frame. visible: the route has a ring (the chat, Review and Results).
        public void Tick(float t, float dt, bool visible)
        {
            shown = Mathf.MoveTowards(shown, visible ? 1 : 0, dt / 0.5f);
            var on = shown > 0.001f;
            if (group.gameObject.activeSelf != on) group.gameObject.SetActive(on);
            if (!on) return;
            // The table rises into place.
            group.localPosition = new Vector3(0, Y - (1 - shown) * (1 - shown) * 0.25f, 0);
            group.localScale = Vector3.one * (0.9f + 0.1f * shown);

            var p = Store.State.profile;
            var k = Mathf.Min(1, dt * 5);
            long Value(string id) => p[id].HasValue ? p[id].Number : 0;
            var years = p["years"].HasValue ? (int)Mathf.Clamp(p["years"].Number, 0, MAX_YEARS) : 0;
            var support = Value("support");
            // The look-ahead slide: as many posts as there would be years of support by then.
            var ahead = Years == "ahead" && Ahead != null && Ahead.ready ? Ahead : null;
            var today = years;
            if (ahead != null) years = (int)Mathf.Clamp(ahead.years, 0, MAX_YEARS);

            // ---------- blocks ----------
            if (front.gameObject.activeSelf != ShowBlocks) front.gameObject.SetActive(ShowBlocks);
            if (ShowBlocks)
            {
                long Amount(string id) => id == "support" ? support * Math.Max(years, 1) : Value(id);
                var most = Math.Max(1, blocks.Max(b => Amount(b.id)));
                for (var i = 0; i < blocks.Count; i++)
                {
                    var b = blocks[i];
                    var field = p[b.id];
                    var amount = Amount(b.id);
                    b.target = field.HasValue && amount > 0 ? Mathf.Max(0.02f, BLOCK_MAX * amount / most) : 0.006f;
                    b.h += (b.target - b.h) * k;
                    b.mesh.localScale = new Vector3(BLOCK, b.h, BLOCK);
                    b.mesh.localPosition = At(BLOCKS[i].angle, R, b.h / 2);
                    var title = b.id == "support" && years > 0 && support > 0 ? $"Everyday costs, {years} {(years == 1 ? "year" : "years")}" : Calc.FIELD[b.id].label;
                    var value = field.status == Status.Empty ? "…"
                        : field.status == Status.Unknown ? "Not sure yet"
                        : field.status == Status.Skipped ? "Left out"
                        : b.id == "support" && years == 0 ? Calc.FormatMoney(support) + " a year" : Calc.FormatMoney(amount);
                    Write(b.sign, title, value);
                }
            }

            // ---------- years ----------
            var haveYears = years > 0;
            if (back.gameObject.activeSelf != haveYears) back.gameObject.SetActive(haveYears);
            if (!haveYears) return;
            // Clockwise from the wearer's right, round behind, to their left: seen from inside, that reads left to right.
            var span = 360 - 2 * FRONT;
            var gap = span / years;
            var width = Mathf.Min(0.16f, gap * Mathf.Deg2Rad * R * 0.62f);
            var tallest = 0;
            for (var i = 0; i < MAX_YEARS; i++)
            {
                var active = i < years;
                if (posts[i].gameObject.activeSelf != active) posts[i].gameObject.SetActive(active);
                if (!active) { postH[i] = 0; continue; }
                var target = Years == "up" ? POST_MAX * (i + 1) / years
                    : Years == "down" ? POST_MAX * (years - i) / years
                    // Each post is a year of support at what it would cost by then; today's is the low mark.
                    : ahead != null ? POST_MAX * 0.7f * (i < today ? 1 : 0.82f)
                    : POST_LOW;
                // The posts rise one after another round the ring, like the bars on the site's charts.
                var lag = Mathf.Clamp01(k * (1.4f - 0.8f * i / years));
                postH[i] += (target - postH[i]) * lag;
                if (postH[i] > postH[tallest]) tallest = i;
                var angle = FRONT + gap * (i + 0.5f);
                posts[i].localScale = new Vector3(width, postH[i], BLOCK * 0.8f);
                posts[i].localPosition = At(angle, R, postH[i] / 2);
                posts[i].localRotation = Quaternion.Euler(0, angle, 0);
            }

            var household = p["household"].choice;
            var age = p["youngestAge"].HasValue && household != null && household != "none" ? p["youngestAge"].Number : (long?)null;
            Place(first, FRONT + gap * 0.5f, R - 0.25f, 0.03f, 50);
            Place(last, FRONT + gap * (years - 0.5f), R - 0.25f, 0.03f, 50);
            if (ahead != null)
            {
                Write(first, "A year of support by then", Calc.FormatMoney(ahead.support));
                Write(last, years > today ? $"{years - today} more {(years - today == 1 ? "year" : "years")} of it" : "For as long as today", $"{years} {(years == 1 ? "year" : "years")}");
            }
            else
            {
                Write(first, age != null ? $"Now (age {age})" : "Now", "Year 1");
                Write(last, age != null ? $"Age {age + years}" : "The last year", $"Year {years}");
            }
            last.panel.group.gameObject.SetActive(years > 1);

            // The total rides on top of the tallest post while the staircase is up.
            var stairs = (Years == "up" || Years == "down") && support > 0;
            total.panel.group.gameObject.SetActive(stairs);
            if (!stairs) return;
            var at = Years == "up" ? years - 1 : 0;
            Place(total, FRONT + gap * (at + 0.5f), R, postH[at] + 0.07f, 8);
            Write(total, Years == "up" ? $"After {years} {(years == 1 ? "year" : "years")}" : "Still ahead today", Calc.FormatMoney(support * years));
        }

        // The editor's screenshot pass has no frames: jump to where everything would settle.
        public void Settle(bool visible)
        {
            shown = visible ? 1 : 0;
            for (var i = 0; i < 6; i++) Tick(0, 1, visible);
        }

        public void Dispose()
        {
            foreach (var b in blocks) b.sign.panel.Dispose();
            foreach (var s in new[] { first, last, total }) s.panel.Dispose();
            foreach (var m in materials) Ui.Kill(m);
            Ui.Kill(group.gameObject);
        }
    }
}
