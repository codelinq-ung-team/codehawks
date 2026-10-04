// The five screens of the LincLife site (Home → Basics → Chat with Abe → Review → Results),
// laid out for a headset: one main card in front, Abe on the left, the number pad or
// side actions on the right. Copy and flow follow the site (codelinc_frontend on main), and
// the chat reads answers with the site's AI backend.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Advisor3D
{
    public static class Screens
    {
        const float MAIN_W = 760, MAIN_H = 660, SIDE_W = 420;
        const float YAW = 34 * Mathf.Deg2Rad;
        const float RADIUS = 1.7f;
        const float M = 36; // main card margin
        const float PX = Ui.PX;
        const string GUIDE_NAME = Script.GUIDE_NAME;

        class Screen
        {
            public Panel main;
            public Action update, dispose;
            public Action<float, float> tick;
            public Func<string> mood;
        }

        static F Fn(int weight, float size) => new F(weight, size);
        static string ListJoin(IList<string> items) => items.Count < 2 ? string.Join("", items) : $"{string.Join(", ", items.Take(items.Count - 1))} and {items[items.Count - 1]}";
        static string Plural(long n, string word) => $"{n} {(n == 1 ? word : word + "s")}";
        static AppState State => Store.State;
        static Message Bot(string text, bool why = false) => new Message { role = "bot", text = text, why = why };
        static Message User(string text) => new Message { role = "user", text = text };

        // ---------- the parts that stay up on every screen ----------
        static Panel left, right, header, footer;
        static El stepper;
        static El[] stepLinks;
        static Btn startOver, roomToggle;
        static float confirmUntil;
        static Guide guide;
        static Picture picture; // the ring of blocks and year posts around the wearer
        static Transform guideHolder; // on the left panel, except in the chat, where Abe stands in the middle
        static List<Message> guideLines = new List<Message>();
        static El guideCard;
        static Screen current;
        static float appear = 1;

        static readonly (string id, string label)[] STEPS = { ("prepare", "Basics"), ("chat", "Chat"), ("review", "Review"), ("results", "Results") };

        static Panel SidePanel(int sign)
        {
            var p = new Panel(SIDE_W, MAIN_H, App.rig, card: false);
            var at = new Vector3(sign * Mathf.Sin(YAW) * RADIUS, App.FOCUS.y, Mathf.Cos(YAW) * RADIUS);
            p.group.localPosition = at;
            p.group.localRotation = Quaternion.LookRotation(new Vector3(at.x, 0, at.z)); // facing the wearer
            return p;
        }

        static void BuildFrame()
        {
            left = SidePanel(-1);
            right = SidePanel(1);

            header = new Panel(MAIN_W, 64, App.rig, r: 32);
            header.group.localPosition = new Vector3(0, App.FOCUS.y + (MAIN_H / 2 + 18 + 32) * PX, App.FOCUS.z);
            header.Add(Ui.Paint(190, 64, ctx =>
            {
                ctx.Rect(16, 14, 36, 36, 11, T.tint);
                ctx.Icon("heart", 34, 32.5f, 20, T.white, 2.4f);
                ctx.Text("Linc", 62, 0, Fn(700, 22), lineH: 64);
                ctx.Text("Life", 62 + Ui.Measure("Linc", Fn(700, 22)), 0, Fn(700, 22), T.highlightText, lineH: 64);
            }), 0, 0);
            stepper = header.Add(new El(380, 64, ctx =>
            {
                var index = Array.FindIndex(STEPS, s => s.id == Store.Route);
                if (index < 0)
                {
                    ctx.Text("Life insurance needs, in a guided chat", 380, 0, Fn(500, 15), T.label2, lineH: 64, align: Align.Right);
                    return;
                }
                for (var i = 0; i < STEPS.Length; i++)
                {
                    var x = i * 96;
                    var done = i < index;
                    var now = i == index;
                    ctx.Rect(x, 14, 88, 4, 2, done ? T.highlightText : now ? T.tint : Ui.C(120, 120, 128, 0.2f));
                    ctx.Circle(x + 9, 38, 9, done ? T.highlightText : now ? T.tint : Ui.C(120, 120, 128, 0.16f));
                    if (done) ctx.Icon("check", x + 9, 38, 11, T.white, 2.4f);
                    ctx.Text(STEPS[i].label, x + 24, 28, Fn(now ? 600 : 400, 15), done || now ? T.label : T.label2, lineH: 20);
                }
            }), 196, 0);
            // Finished steps link back (answers live in the store, so nothing is lost).
            stepLinks = STEPS.Select((step, i) =>
            {
                var link = header.Add(new El(92, 44, null), 196 + i * 96 - 2, 10);
                link.onSelect = () => Store.Go(step.id);
                return link;
            }).ToArray();
            startOver = header.Add(Ui.Button(168, 40, new BtnO
            {
                label = "Start Over", variant = "plain", size = 16,
                onSelect = () =>
                {
                    if (startOver.o.variant == "danger")
                    {
                        ResetStartOver();
                        App.StartOver();
                    }
                    else
                    {
                        // The frontend asks "Start over?" in an alert. Here a second tap confirms.
                        startOver.Set(o => { o.label = "Tap again to clear"; o.variant = "danger"; });
                        confirmUntil = Time.time + 4;
                    }
                },
            }), MAIN_W - 168 - 12, 12);

            footer = new Panel(MAIN_W, 52, App.rig, card: false);
            footer.group.localPosition = new Vector3(0, App.FOCUS.y - (MAIN_H / 2 + 14 + 26) * PX, App.FOCUS.z);
            footer.Add(Ui.Paint(MAIN_W, 52, ctx =>
            {
                ctx.Rect(0, 0, MAIN_W, 52, 18, Ui.C(255, 255, 255, 0.82f));
                ctx.Text("LincLife gives an educational estimate, not a quote, a recommendation, or financial, legal, or tax advice. It doesn’t account for inflation, investment returns, taxes, or Social Security. Prototype: answers clear when the app closes.",
                    MAIN_W / 2, 8, Fn(400, 12.5f), T.label2, maxW: MAIN_W - 36, lineH: 18, align: Align.Center);
            }), 0, 0);

            // The WebXR page had "Enter VR" and "Enter Passthrough". The app starts in the VR room; this switches.
            if (Application.isMobilePlatform)
            {
                roomToggle = footer.Add(Ui.Button(250, 44, new BtnO
                {
                    label = "Show My Real Room", variant = "inverse", size = 16,
                    onSelect = () =>
                    {
                        App.SetPassthrough(!App.Passthrough);
                        roomToggle.Set(o => o.label = App.Passthrough ? "Show the VR Room" : "Show My Real Room");
                    },
                }), (MAIN_W - 250) / 2, 66);
            }

            // ---------- Abe, on the left ----------
            guideHolder = new GameObject("Guide Holder").transform;
            guide = new Guide(0.36f, guideHolder);
            GuideHome();
            picture = new Picture(App.rig, TERM_COLOR);

            guideCard = left.Add(new El(SIDE_W, 460, ctx =>
            {
                // One card: Abe's name plate, then whatever he is saying on this screen. (The chat hides it.)
                var bubbles = guideLines.Select(m => BubbleLayout(m, 16, (SIDE_W - 36) * 0.88f)).ToList();
                var h = bubbles.Sum(b => b.h + 8) + 78 + (bubbles.Count > 0 ? 12 : -4);
                ctx.Shadow(0, 0, SIDE_W, h, 24, Ui.C(60, 20, 30, 0.14f), 48, 20);
                ctx.Rect(0, 0, SIDE_W, h, 24, T.bg);
                ctx.Rect(0.5f, 0.5f, SIDE_W - 1, h - 1, 24, null, T.edge, 1);

                ctx.Text(GUIDE_NAME, SIDE_W / 2, 12, Fn(700, 22), align: Align.Center, lineH: 28);
                const string sub = "Your life insurance guide";
                var sw = Ui.Measure(sub, Fn(400, 15));
                ctx.Circle(SIDE_W / 2 - sw / 2 - 4, 51, 4, T.success);
                ctx.Text(sub, SIDE_W / 2 + 6, 40, Fn(400, 15), T.label2, align: Align.Center, lineH: 22);
                if (bubbles.Count == 0) return;
                ctx.Fill(18, 74, SIDE_W - 36, 1, T.edge);
                var y = 88f;
                foreach (var b in bubbles)
                {
                    DrawBubble(ctx, b, b.m.role == "user" ? SIDE_W - 18 - b.w : 18, y);
                    y += b.h + 8;
                }
            }), 0, 250);
        }

        // Abe's usual place: above his card on the left panel.
        static void GuideHome()
        {
            guideHolder.SetParent(left.group, false);
            guideHolder.localPosition = left.At(SIDE_W / 2, 124, 0.02f);
            guideHolder.localRotation = Quaternion.identity;
            guideHolder.localScale = Vector3.one;
        }

        static void ResetStartOver()
        {
            confirmUntil = 0;
            startOver.Set(o => { o.label = "Start Over"; o.variant = "plain"; });
        }

        static void Say(params Message[] lines)
        {
            guideLines = lines.ToList();
            guideCard.Redraw();
        }

        // ---------- chat bubbles (used by Abe's card and by the chat log) ----------
        class Bubble
        {
            public Message m;
            public F f;
            public float size, lineH, padX, padY, tag, w, h;
            public List<string> lines;
        }

        static Bubble BubbleLayout(Message m, float size, float maxW)
        {
            var f = Fn(400, size);
            var lineH = Mathf.Round(size * 1.36f);
            var padX = Mathf.Round(size * 0.8f);
            var padY = Mathf.Round(size * 0.55f);
            var lines = Ui.Wrap(m.text, f, maxW - padX * 2);
            var tag = m.why ? Mathf.Round(size * 1.25f) : 0;
            var textW = Mathf.Max(lines.Max(l => Ui.Measure(l, f)), m.why ? Ui.Measure("Why we ask", Fn(600, size - 3)) + size + 6 : 0);
            return new Bubble { m = m, f = f, size = size, lineH = lineH, padX = padX, padY = padY, lines = lines, tag = tag, w = Mathf.Ceil(textW) + padX * 2, h = lines.Count * lineH + padY * 2 + tag };
        }

        static void DrawBubble(Ctx ctx, Bubble b, float x, float y)
        {
            var m = b.m;
            var r = Mathf.Min(20, b.h / 2);
            var user = m.role == "user";
            var radii = user ? new[] { r, r, 6, r } : new[] { r, r, r, 6 };
            if (m.why)
            {
                ctx.Rect(x, y, b.w, b.h, radii, T.bg);
                ctx.Rect(x + 0.75f, y + 0.75f, b.w - 1.5f, b.h - 1.5f, radii, null, T.tint, 1.5f);
                ctx.Icon("info", x + b.padX + b.size * 0.42f, y + b.padY + b.tag / 2 - 2, b.size * 0.84f, T.tint, 1.6f);
                ctx.Text("Why we ask", x + b.padX + b.size + 2, y + b.padY - 2, Fn(600, b.size - 3), T.tint, lineH: b.tag);
            }
            else ctx.Rect(x, y, b.w, b.h, radii, user ? T.tint : T.grouped);
            ctx.Text(string.Join("\n", b.lines), x + b.padX, y + b.padY + b.tag, b.f, user ? T.white : T.label, lineH: b.lineH);
        }

        // What Abe would answer to "why do you ask?" for a field, straight from the chat script.
        static string Why(string id) => Script.WhyText(id);

        // ---------- number pad, on the right ----------
        class Pad
        {
            public Action<string> press, fail;
            public Action submit, refresh;
        }

        class PadAction
        {
            public string label, icon;
            public Action<long?> onSelect;
            public Func<long?, bool> disabled;
        }

        static Pad pad; // the pad a physical keyboard types into

        static void ClearRight()
        {
            right.Clear("main");
            pad = null;
        }

        static Pad NumberPad(string title, bool money, PadAction action, long? value = null, string hint = "", Action<long?> onChange = null)
        {
            var digits = value == null ? "" : value.Value.ToString();
            var note = hint;
            var error = false;
            const float Y = 20;
            right.Add(Ui.Card(SIDE_W, 562), 0, Y);
            var display = right.Add(new El(SIDE_W, 128, ctx =>
            {
                ctx.Text(title, 30, 20, Fn(600, 17), T.label2, lineH: 22);
                ctx.Rect(31, 53, 358, 62, 14, T.bg, error ? T.danger : T.tint, 2);
                var text = digits == "" ? "0" : Calc.Grouped(long.Parse(digits));
                var x = 48f;
                if (money)
                {
                    ctx.Text("$", x, 53, Fn(600, 26), T.label2, lineH: 62);
                    x += Ui.Measure("$", Fn(600, 26)) + 6;
                }
                ctx.Text(text, x, 53, Fn(700, 32), digits == "" ? Ui.C("#c7c7cc") : T.label, lineH: 62);
            }), 0, Y).Redraw();
            var hintEl = right.Add(new El(SIDE_W, 50, ctx =>
            {
                ctx.Text(note, 30, 0, Fn(error ? 600 : 400, 14), error ? T.danger : T.label2, maxW: 360, lineH: 19);
            }), 0, Y + 498).Redraw();

            long? Current() => digits == "" ? (long?)null : long.Parse(digits);
            bool Disabled() => action.disabled?.Invoke(Current()) ?? false;
            var act = right.Add(Ui.Button(360, 54, new BtnO { label = action.label, icon = action.icon, onSelect = () => action.onSelect(Current()), disabled = Disabled() }), 30, Y + 434);
            void Press(string k)
            {
                if (k == "back") digits = digits.Length > 0 ? digits.Substring(0, digits.Length - 1) : "";
                else if (digits == "" || digits == "0") digits = k == "000" ? digits : k;
                else if ((digits + k).Length <= 9) digits += k;
                note = hint;
                error = false;
                onChange?.Invoke(Current());
                display.Redraw();
                hintEl.Redraw();
                act.Set(o => o.disabled = Disabled());
            }
            var keys = new[] { "1", "2", "3", "4", "5", "6", "7", "8", "9", money ? "000" : null, "0", "back" };
            for (var i = 0; i < keys.Length; i++)
            {
                var k = keys[i];
                if (k == null) continue;
                var e = k == "back" ? Ui.Key(112, 64, "", () => Press(k), "backspace") : Ui.Key(112, 64, k == "000" ? ",000" : k, () => Press(k));
                right.Add(e, 30 + i % 3 * 124, Y + 134 + i / 3 * 74);
            }

            return pad = new Pad
            {
                press = Press,
                submit = () => { if (act.enabled) act.onSelect(); },
                refresh = () => act.Set(o => o.disabled = Disabled()),
                fail = text => { note = text; error = true; display.Redraw(); hintEl.Redraw(); },
            };
        }

        // In the editor, a physical keyboard types the answer line when it is open, and otherwise the number pad.
        static void TypeKeys()
        {
            var kb = UnityEngine.InputSystem.Keyboard.current;
            if (kb == null) return;
            if (typingHere)
            {
                if (kb.backspaceKey.wasPressedThisFrame && draft.Length > 0) { draft = draft.Substring(0, draft.Length - 1); draftEl?.Redraw(); }
                else if (kb.enterKey.wasPressedThisFrame || kb.numpadEnterKey.wasPressedThisFrame) SendDraft();
                else if (kb.escapeKey.wasPressedThisFrame) { typingHere = false; draftEl?.Redraw(); }
                return;
            }
            if (pad == null) return;
            for (var d = 0; d <= 9; d++)
            {
                if (kb[d == 0 ? Key.Digit0 : Key.Digit1 + (d - 1)].wasPressedThisFrame || kb[Key.Numpad0 + d].wasPressedThisFrame) { pad.press(d.ToString()); return; }
            }
            if (kb.backspaceKey.wasPressedThisFrame) pad.press("back");
            else if (kb.enterKey.wasPressedThisFrame || kb.numpadEnterKey.wasPressedThisFrame) pad.submit();
        }

        static Panel MainPanel()
        {
            var p = new Panel(MAIN_W, MAIN_H, App.rig);
            p.group.localPosition = App.FOCUS;
            return p;
        }

        // ---------- Home ----------
        static readonly Message[] DEMO =
        {
            Bot($"Hi, I’m {GUIDE_NAME}! About how much do you earn in a year?"),
            User("Why do you ask?"),
            Bot("It’s the paycheck your family would lose. It’s a starting point, not the final number.", why: true),
            User("Makes sense. About $75,000."),
            Bot("Thanks! Next, let’s talk about any debts."),
        };

        static readonly (string icon, Color hue, string title, string text)[] HOW =
        {
            ("info", T.hue.blue, "Start with the basics", "Five quick questions about your income, family, debts and coverage."),
            ("people", T.hue.indigo, "Chat with " + GUIDE_NAME, "Ask “why?” any time. “Not sure” is always an answer."),
            ("check-circle", T.hue.green, "Check your answers", "Fix anything before we do the math."),
            ("trend-up", T.hue.orange, "See the math", "Try different numbers and watch the gap change in front of you."),
        };

        static Screen Home()
        {
            var main = MainPanel();
            var s = State;
            var resume = s.started;
            void Begin() => Store.Go(resume ? (s.messages.Count > 0 ? "chat" : "prepare") : "prepare");

            main.Add(Ui.Paint(MAIN_W, MAIN_H, ctx =>
            {
                ctx.Text("Life insurance,", M, 88, Fn(800, 64), T.tint, lineH: 66, spacing: -2.2f);
                ctx.Text("made simple.", M, 154, Fn(800, 64), T.highlightText, lineH: 66, spacing: -2.2f);
                ctx.Text("Find out how much coverage your family may need in one friendly conversation. We explain every question and show you every number.",
                    M + 4, 242, Fn(400, 20), T.label2, maxW: 620, lineH: 31);
                if (!resume) ctx.Text("5 quick questions,\nthen a short chat", M + 430, 366, Fn(400, 16), T.label2, lineH: 22);

                ctx.Fill(M, 492, MAIN_W - M * 2, 1, T.edge);
                var promises = new[] { ("shield", "Private by design", "No account, and nothing is saved"), ("check-circle", "Educational guidance", "No account, nothing to buy") };
                for (var i = 0; i < promises.Length; i++)
                {
                    var (ic, strong, text) = promises[i];
                    var x = M + 4 + i * 330;
                    ctx.Icon(ic, x + 12, 530, 25, T.tint, 2);
                    ctx.Text(strong, x + 38, 510, Fn(600, 16), lineH: 21);
                    ctx.Text(text, x + 38, 531, Fn(400, 14), T.label2, lineH: 19);
                }

                // The stats band along the bottom of the card.
                ctx.Rect(0, 574, MAIN_W, 86, new float[] { 0, 0, 24, 24 }, T.tint);
                var stats = new[] { ("~10", "short questions"), ("100%", "free"), ("0", "accounts needed"), ("1", "summary to keep") };
                for (var i = 0; i < stats.Length; i++)
                {
                    var (n, label) = stats[i];
                    var cx = MAIN_W / 8 + i * MAIN_W / 4;
                    var nf = Fn(700, 28);
                    var lf = Fn(400, 15);
                    var w = Ui.Measure(n, nf) + 8 + Ui.Measure(label, lf);
                    ctx.Text(n, cx - w / 2, 574, nf, T.white, lineH: 86);
                    ctx.Text(label, cx - w / 2 + Ui.Measure(n, nf) + 8, 576, lf, T.onBrandMuted, lineH: 86);
                    if (i > 0) ctx.Fill(i * MAIN_W / 4, 596, 1, 42, Ui.C(255, 255, 255, 0.18f));
                }
            }), 0, 0);

            main.Add(Ui.Button(410, 62, new BtnO { label = resume ? "Continue Where You Left Off" : "Start Your Free Assessment", icon = "chevron-right", size = 20, onSelect = Begin }), M, 352);
            if (resume) main.Add(Ui.Button(210, 44, new BtnO { label = "Start fresh instead", variant = "plain", size = 16, onSelect = () => { Store.Reset(); Store.Go("prepare"); } }), M + 424, 361);
            main.Add(Ui.Button(250, 46, new BtnO { label = "See a sample family", variant = "bordered", size = 17, onSelect = () => { Store.LoadSample(); Store.Go("results"); } }), M, 428);

            right.Add(Ui.Card(SIDE_W, 600), 0, 30);
            right.Add(Ui.Paint(SIDE_W, 600, ctx =>
            {
                ctx.Text("How it works", 30, 28, Fn(800, 28), T.tint, lineH: 34, spacing: -0.6f);
                ctx.Text("A calm, step-by-step chat. You stay in control of every answer.", 30, 68, Fn(400, 16), T.label2, maxW: 350, lineH: 23);
                for (var i = 0; i < HOW.Length; i++)
                {
                    var (ic, hue, title, text) = HOW[i];
                    var y = 136 + i * 98;
                    ctx.Rect(30, y, 42, 42, 12, hue);
                    ctx.Icon(ic, 51, y + 21, 22, T.white, 2.2f);
                    ctx.Text(title, 88, y - 2, Fn(600, 18), lineH: 24);
                    ctx.Text(text, 88, y + 24, Fn(400, 15), T.label2, maxW: 300, lineH: 21);
                }
                ctx.Fill(30, 530, SIDE_W - 60, 1, T.edge);
                ctx.Text("Point and pinch, or pull the trigger. Lost the panels? Look away for a moment, or tap B or Y. Hold B or Y to start over.", 30, 538, Fn(500, 13), T.tint, maxW: 360, lineH: 18);
            }), 0, 30);

            // Abe previews the chat, one message at a time, like the Home page of the 2D site.
            var shown = 0;
            var next = 0.7f;
            Say();
            return new Screen
            {
                main = main,
                tick = (t, dt) =>
                {
                    if (shown >= DEMO.Length) return;
                    next -= dt;
                    if (next > 0) return;
                    shown += 1;
                    next = shown < DEMO.Length && DEMO[shown].role == "bot" ? 1.3f : 0.9f;
                    Say(DEMO.Take(shown).ToArray());
                },
                mood = () => shown < DEMO.Length && DEMO[shown].role == "bot" ? "typing" : "idle",
            };
        }

        // ---------- Basics: five short form questions before the chat ----------
        class FormQuestion
        {
            public string id, type, prompt, helper, why;
            public bool money;
            public long max;
            public (string label, object value)[] options;
        }

        static readonly FormQuestion[] QUESTIONS =
        {
            new FormQuestion { id = "income", type = "number", money = true, max = 100_000_000, prompt = "What is your yearly income?", helper = "Before taxes. A rough number is fine.", why = "income" },
            new FormQuestion { id = "marital", type = "options", prompt = "What is your marital status?", helper = "Choose Married if you share a household with a partner.", options = new (string, object)[] { ("Single", "single"), ("Married", "married") }, why = "household" },
            new FormQuestion { id = "dependents", type = "number", max = 20, prompt = "How many dependents do you have?", helper = "Children, or anyone else who relies on your income. Enter 0 if no one does.", why = "household" },
            new FormQuestion { id = "debt", type = "number", money = true, max = 100_000_000, prompt = "What is your current total debt?", helper = $"Include your mortgage, car loans, student loans and credit cards. {GUIDE_NAME} will ask how much of it is the mortgage.", why = "otherDebts" },
            new FormQuestion { id = "coverage", type = "options", prompt = "Do you currently have life insurance?", helper = "Include any coverage through work.", options = new (string, object)[] { ("Yes", true), ("No", false) }, why = "existing" },
        };

        static object FormGet(Form f, string id) => id switch
        {
            "income" => f.income, "marital" => f.marital, "dependents" => f.dependents, "debt" => f.debt, "coverage" => f.coverage, _ => null,
        };

        static void FormSet(Form f, string id, object v)
        {
            switch (id)
            {
                case "income": f.income = (long?)v; break;
                case "marital": f.marital = (string)v; break;
                case "dependents": f.dependents = (long?)v; break;
                case "debt": f.debt = (long?)v; break;
                case "coverage": f.coverage = (bool?)v; break;
            }
        }

        static Screen Prepare()
        {
            var main = MainPanel();
            var index = 0;
            Btn cont = null;
            var options = new List<Opt>();
            El input = null;
            FormQuestion Q() => QUESTIONS[index];
            object Answer() => FormGet(State.form, Q().id);
            bool TooBig() => Q().type == "number" && Answer() is long n && n > Q().max;
            bool Blocked() => Answer() == null || TooBig();
            void Save(object value) => Store.Set(s => FormSet(s.form, Q().id, value));
            Action render = null;

            void Next()
            {
                if (index == QUESTIONS.Length - 1)
                {
                    Store.Set(s => { Script.ApplyForm(s); s.started = true; });
                    Store.Go("chat");
                }
                else
                {
                    index += 1;
                    render();
                }
            }

            var head = main.Add(new El(MAIN_W, 350, ctx =>
            {
                var progress = Mathf.Round((index + 1) / (float)QUESTIONS.Length * 100);
                ctx.Text($"Basics · Question {index + 1} of {QUESTIONS.Length}", M, 32, Fn(600, 15), T.label2, lineH: 20);
                ctx.Rect(M, 62, MAIN_W - M * 2, 6, 3, T.grouped3);
                ctx.Rect(M, 62, (MAIN_W - M * 2) * progress / 100, 6, 3, T.highlight);
                ctx.Rect(M, 104, 46, 46, 12, T.rose);
                ctx.Text((index + 1).ToString("00"), M + 23, 104, Fn(700, 15), T.tint, lineH: 46, align: Align.Center);
                var h = ctx.Text(Q().prompt, M, 170, Fn(800, 38), T.tint, maxW: MAIN_W - M * 2, lineH: 44, spacing: -1.1f);
                ctx.Text(Q().helper, M, 180 + h, Fn(400, 19), T.label2, maxW: 620, lineH: 28);
            }), 0, 0);
            var back = main.Add(Ui.Button(130, 52, new BtnO { label = "Back", variant = "bordered", onSelect = () => { index -= 1; render(); } }), M, 572);

            render = () =>
            {
                main.Clear("q");
                ClearRight();
                head.Redraw();
                back.Visible = index > 0;
                options.Clear();
                input = null;
                var last = index == QUESTIONS.Length - 1;
                var w = last ? 290 : 190;
                var q = Q();
                cont = main.Add(Ui.Button(w, 52, new BtnO { label = last ? $"Start Chat with {GUIDE_NAME}" : "Continue", icon = "chevron-right", onSelect = Next, disabled = Blocked() }), MAIN_W - M - w, 572, "q");

                if (q.type == "options")
                {
                    for (var i = 0; i < q.options.Length; i++)
                    {
                        var (label, value) = q.options[i];
                        var o = main.Add(Ui.Option(MAIN_W - M * 2, 68, label, Equals(Answer(), value), () => Save(value)), M, 360 + i * 80, "q");
                        o.value = value;
                        options.Add(o);
                    }
                }
                else
                {
                    input = main.Add(new El(MAIN_W - M * 2, 110, ctx =>
                    {
                        var v = Answer() as long?;
                        ctx.Rect(1, 1, MAIN_W - M * 2 - 2, 70, 14, T.bg, TooBig() ? T.danger : T.tint, 2);
                        var x = 22f;
                        if (q.money) { ctx.Text("$", x, 0, Fn(600, 24), T.label2, lineH: 72); x += 22; }
                        if (v != null) ctx.Text(Calc.Grouped(v.Value), x, 0, Fn(600, 28), T.label, lineH: 72);
                        else ctx.Text("Use the number pad on your right", x, 0, Fn(400, 20), T.gray, lineH: 72);
                        if (TooBig()) ctx.Text($"Please enter a number up to {Calc.Grouped(q.max)}.", 4, 80, Fn(600, 15), T.danger, lineH: 20);
                    }), M, 360, "q").Redraw();
                    // "Not sure" leaves the answer empty (never zero); Abe asks again in the chat.
                    main.Add(Ui.Button(380, 40, new BtnO { label = $"Not sure? Skip, and {GUIDE_NAME} will ask later", variant = "plain", size = 16, onSelect = () => { Save(null); Next(); } }), M - 8, 476, "q");
                    NumberPad(q.prompt, q.money, new PadAction
                    {
                        label = last ? $"Start Chat with {GUIDE_NAME}" : "Continue", icon = "chevron-right",
                        onSelect = _ => { if (!Blocked()) Next(); },
                        disabled = _ => Blocked(),
                    }, value: Answer() as long?, onChange: v => Save(v));
                }
                Say(
                    Bot(index == 0 ? "Five quick questions first, then we’ll chat. A rough number is always fine." : "Thanks! Take your time with this one."),
                    Bot(Why(q.why), why: true));
            };
            render();

            return new Screen
            {
                main = main,
                update = () =>
                {
                    foreach (var o in options) { o.on = Equals(Answer(), o.value); o.Redraw(); }
                    input?.Redraw();
                    cont.Set(o => o.disabled = Blocked());
                    pad?.refresh();
                },
            };
        }

        // ---------- Chat with Abe ----------
        // Spoken or typed answers are read by the site's AI (Backend.ReadAnswer); tapped suggestions,
        // number-pad answers, and any answer the AI can't be reached for, are read by the script.
        // The order of questions never changes.
        static void Push(params Message[] msgs) => Store.Set(s => s.messages.AddRange(msgs));

        // Coroutines need play mode; the editor's screenshot pass runs them straight through instead.
        static void Run(IEnumerator routine)
        {
            if (Application.isPlaying) App.I.StartCoroutine(routine);
            else while (routine.MoveNext()) { }
        }

        static IEnumerator BotSay(IList<string> lines, Action<Message> last)
        {
            for (var i = 0; i < lines.Count; i++)
            {
                Store.Set(s => s.typing = true);
                yield return new WaitForSeconds(0.45f);
                var m = Bot(lines[i]);
                if (i == lines.Count - 1) last(m);
                Push(m);
            }
            Store.Set(s => s.typing = false);
        }

        static void BeginChat()
        {
            var s = State;
            var step = Script.NextStep(s);
            var q = step != null ? Script.Ask(step, s) : null;
            var lines = Script.Intro(s);
            lines.Add(q != null ? q.text : Script.CLOSING);
            Run(BotSay(lines, m => { if (q != null) m.replies = q.replies; else m.done = true; }));
        }

        // scripted: the answer came from the number pad, so it is an exact figure and needs no AI.
        static void Send(string text, bool scripted = false)
        {
            var s = State;
            text = text.Trim();
            if (text.Length == 0 || s.typing) return;
            // While voice is on, Abe hears a tapped or typed answer as if it were spoken.
            if (Voice.On) { Voice.Say(text); return; }
            var last = s.messages.Count > 0 ? s.messages[s.messages.Count - 1] : null;
            var step = Script.NextStep(s);
            Push(User(text));
            if (step == null) { Run(BotSay(new[] { Script.CLOSING }, m => m.done = true)); return; }

            if (scripted || s.pending != null || (last?.replies?.Contains(text) ?? false))
            {
                Settle(step, Script.Respond(step, text, s));
                return;
            }
            Store.Set(st => st.typing = true);
            var count = s.messages.Count;
            Backend.ReadAnswer(step, last?.text ?? "", text, s, reading =>
            {
                // Start Over while Abe was thinking: drop the reply.
                if (State != s || s.messages.Count != count) return;
                var res = reading != null ? Script.Interpret(step, reading, s, text) : Script.Respond(step, text, s);
                s.offline = reading == null;
                Settle(step, res);
            });
        }

        // Save what the reply settled, then have Abe say it and ask whatever comes next.
        static void Settle(string step, Reply res)
        {
            if (res.updates != null || res.pendingSet)
            {
                Store.Set(st =>
                {
                    if (res.updates != null) foreach (var kv in res.updates) st.profile[kv.Key] = kv.Value;
                    if (res.pendingSet) st.pending = res.pending;
                });
            }

            if (res.why)
            {
                var replies = Script.Ask(step, State).replies.Where(r => r != Script.WHY).ToList();
                Run(BotSay(res.say, m => { m.replies = replies; m.why = true; }));
                return;
            }
            if (res.replies != null) { Run(BotSay(res.say, m => m.replies = res.replies)); return; }

            var next = Script.NextStep(State);
            var lines = new List<string>(res.say);
            if (next != null)
            {
                var q = Script.Ask(next, State);
                lines.Add(q.text);
                Run(BotSay(lines, m => m.replies = q.replies));
                return;
            }
            lines.Add(Script.CLOSING);
            Run(BotSay(lines, m => m.done = true));
        }

        // "What Abe knows": every answer Abe has so far, listed on the left of the chat, with a way
        // to take each one back. Basics answers come first, then what Abe learned in the chat.
        class Fact
        {
            public bool form; // a Basics answer the chat doesn't store as a field of its own
            public string id, label, value;
            public bool unsure;
        }

        static readonly string[] BASICS_ORDER = { "income", "marital", "dependents", "household", "debt", "mortgage", "otherDebts", "coverage", "existing" };

        static List<Fact> Facts(Profile profile, Form form)
        {
            bool Has(string id) => profile[id].status != Status.Empty;
            var basics = new List<Fact>();
            var chat = new List<Fact>();
            void FromForm(string id, string label, string value) => basics.Add(new Fact { form = true, id = id, label = label, value = value });
            if (form.marital != null) FromForm("marital", "Marital status", form.marital == "married" ? "Married" : "Single");
            if (form.dependents != null) FromForm("dependents", "Dependents", form.dependents.ToString());
            if (form.debt > 0 && !(Has("mortgage") && Has("otherDebts"))) FromForm("debt", "Total debt", Calc.FormatMoney(form.debt.Value));
            if (form.coverage == true && !Has("existing")) FromForm("coverage", "Has life insurance", "Yes");

            foreach (var f in Calc.FIELDS)
            {
                var field = profile[f.id];
                if (field.status == Status.Empty) continue;
                var yearly = field.IsSet && (f.id == "income" || f.id == "support");
                var fact = new Fact { id = f.id, label = f.label, value = Calc.FormatField(f.id, field) + (yearly ? "/yr" : ""), unsure = !field.IsSet };
                (field.fromForm ? basics : chat).Add(fact);
            }
            basics = basics.OrderBy(f => Array.IndexOf(BASICS_ORDER, f.id)).ToList();
            basics.AddRange(chat);
            return basics;
        }

        // Take an answer back. Abe acknowledges it and asks whatever he needs next, so the
        // question on screen always matches the answer the chat expects.
        static void Forget(Fact fact)
        {
            if (State.typing) return;
            Store.Set(s =>
            {
                if (fact.form) FormSet(s.form, fact.id, null); else s.profile[fact.id] = Field.Empty();
                s.pending = null;
            });
            if (Voice.On) { Voice.Changed(); return; }
            var next = Script.NextStep(State);
            var q = next != null ? Script.Ask(next, State) : null;
            Run(BotSay(new[] { "Okay, I’ve taken that off my list.", q != null ? q.text : Script.CLOSING }, m => { if (q != null) m.replies = q.replies; else m.done = true; }));
        }

        const int KNOWS_ROWS = 9;
        const float KNOWS_TOP = 118, KNOWS_ROW = 40;
        const float KNOWS_LIFT = 64; // the list was laid out under Abe's name plate; on its own card it starts higher
        static List<Fact> knows; // null outside the chat
        static int knowsTotal;

        static void ShowKnows()
        {
            var all = Facts(State.profile, State.form);
            knowsTotal = all.Count;
            knows = all.Skip(Math.Max(0, all.Count - KNOWS_ROWS)).ToList();
            left.Clear("knows");
            const float Y = 20;
            var h = KNOWS_TOP - KNOWS_LIFT + KnowsHeight();
            left.Add(new El(SIDE_W, h, ctx =>
            {
                ctx.Shadow(0, 0, SIDE_W, h, 24, Ui.C(60, 20, 30, 0.14f), 48, 20);
                ctx.Rect(0, 0, SIDE_W, h, 24, T.bg);
                ctx.Rect(0.5f, 0.5f, SIDE_W - 1, h - 1, 24, null, T.edge, 1);
                DrawKnows(ctx);
            }), 0, Y, "knows").Redraw();
            var top = Y + KNOWS_TOP - KNOWS_LIFT + (knowsTotal > knows.Count ? 22 : 0);
            for (var i = 0; i < knows.Count; i++)
            {
                var fact = knows[i];
                var x = left.Add(new El(30, 30, ctx =>
                {
                    ctx.Circle(15, 15, 15, T.fill3);
                    ctx.Icon("xmark", 15, 15, 16, T.label2, 2);
                }), SIDE_W - 18 - 30, top + i * KNOWS_ROW + 5, "knows");
                x.onSelect = () => Forget(fact);
                x.Redraw().SetEnabled(!State.typing);
            }
        }

        static void DrawKnows(Ctx ctx)
        {
            ctx.Text($"What {GUIDE_NAME} knows", 18, 84 - KNOWS_LIFT, Fn(700, 17), lineH: 24);
            if (knows.Count == 0)
            {
                ctx.Text("Nothing yet. Your answers show up here, and you can take any of them back.", 18, KNOWS_TOP - KNOWS_LIFT, Fn(400, 14), T.label2, maxW: SIDE_W - 36, lineH: 20);
                return;
            }
            var y = KNOWS_TOP - KNOWS_LIFT;
            if (knowsTotal > knows.Count)
            {
                ctx.Text($"The latest {knows.Count} of {knowsTotal}. All of them are on the Review screen.", 18, y - 2, Fn(400, 13), T.label2, lineH: 18);
                y += 22;
            }
            for (var i = 0; i < knows.Count; i++)
            {
                var f = knows[i];
                if (i > 0) ctx.Fill(18, y, SIDE_W - 36, 1, T.separator);
                var vf = Fn(600, 15);
                var edge = SIDE_W - 18 - 38;
                var room = edge - 18 - Ui.Measure(f.value, vf) - 12;
                ctx.Text(Ui.Wrap(f.label, Fn(400, 14), room)[0], 18, y, Fn(400, 14), T.label2, lineH: KNOWS_ROW);
                ctx.Text(f.value, edge, y, vf, f.unsure ? T.warning : T.label, lineH: KNOWS_ROW, align: Align.Right);
                y += KNOWS_ROW;
            }
        }

        static float KnowsHeight() => knows.Count == 0 ? 64 : knows.Count * KNOWS_ROW + (knowsTotal > knows.Count ? 22 : 0) + 6;

        // The answer being typed or dictated. In the headset the system keyboard (with its microphone
        // key) fills it in; in the editor a physical keyboard does.
        static string draft = "";
        static bool typingHere; // the editor's stand-in for the system keyboard being open
        static TouchScreenKeyboard keyboard;
        static El draftEl;

        static void OpenKeyboard()
        {
            if (TouchScreenKeyboard.isSupported) keyboard = TouchScreenKeyboard.Open(draft, TouchScreenKeyboardType.Default, true, false, false, false, "Type or say your answer");
            else typingHere = true;
            draftEl?.Redraw();
        }

        static void SendDraft()
        {
            var text = draft;
            draft = "";
            typingHere = false;
            draftEl?.Redraw();
            Send(text);
        }

        static void OnChar(char c)
        {
            if (!typingHere || char.IsControl(c) || draft.Length >= 1000) return;
            draft += c;
            draftEl?.Redraw();
        }

        static string ChatNote() => Voice.Error != "" ? Voice.Error
            : Voice.On ? $"{GUIDE_NAME} is listening. Just talk; you can still tap an answer. The math is done by a calculator, not the AI."
            : State.offline
            ? $"{GUIDE_NAME} can’t reach the AI right now, so he’s reading answers with his built-in script. Your answers are safe."
            : $"{GUIDE_NAME} uses AI to read what you say or type. The math is done by a calculator, not the AI.";

        static Screen Chat()
        {
            var main = MainPanel();
            const float HEAD = 84;
            const float INPUT_Y = MAIN_H - 92;
            var composer = 104f; // height of the reply area at the bottom of the card
            string chipsKey = null, knowsKey = null;
            var padKey = "?";
            var phase = 0;
            var voiceKey = "?";
            var voiceVersion = Voice.Version;

            // Abe stands at the top of the card and the conversation runs directly under him, so it
            // reads as talking with him: his words appear as he says them, and yours once heard.
            const float ABE_Y = HEAD + 104, TOP = HEAD + 204;
            guideCard.Visible = false;
            guideHolder.SetParent(main.group, false);
            guideHolder.localPosition = main.At(MAIN_W / 2, ABE_Y, 0.02f);
            guideHolder.localScale = Vector3.one * 0.8f;
            var caption = "";
            var captionWait = 0f;

            var log = main.Add(new El(MAIN_W, MAIN_H, ctx =>
            {
                var s = State;
                var msgs = s.messages;
                ctx.Fill(0, HEAD - 1, MAIN_W, 1, T.edge);
                ctx.Fill(0, MAIN_H - composer, MAIN_W, 1, T.edge);
                ctx.Face(28, 16, 52);
                ctx.Text(GUIDE_NAME, 94, 18, Fn(600, 20), lineH: 26);
                ctx.Circle(98, 56, 4, T.success);
                var doing = Voice.On ? (Voice.Speaking ? "Speaking…" : "Listening…") : Voice.Status == "connecting" ? "Connecting…" : "Here to help";
                ctx.Text("Your guide · " + doing, 108, 46, Fn(400, 15), T.label2, lineH: 20);

                // Newest at the bottom. Older messages scroll off under Abe.
                var bottom = MAIN_H - composer - 10;
                var clip = ctx.Clip(0, TOP, MAIN_W, bottom - TOP + 6);
                var y = bottom;
                var maxW = (MAIN_W - 56) * 0.78f;
                void Dots(float x)
                {
                    y -= 42;
                    clip.Rect(x, y, 66, 42, new float[] { 20, 20, 20, 20 }, T.grouped);
                    for (var i = 0; i < 3; i++) clip.Circle(x + 20 + i * 13, y + 21 - (phase == i ? 3 : 0), 3.5f, phase == i ? T.label2 : Ui.C("#c2c2c7"));
                    y -= 8;
                }
                if (Voice.Hearing) Dots(MAIN_W - 28 - 66);          // you are talking; your words are on their way
                else if (caption != "")                              // Abe, mid-sentence
                {
                    var b = BubbleLayout(Bot(caption), 18, maxW);
                    y -= b.h;
                    DrawBubble(clip, b, 28, y);
                    y -= 8;
                }
                else if (s.typing || Voice.Status == "connecting") Dots(28);
                for (var i = msgs.Count - 1; i >= 0 && y > TOP; i--)
                {
                    var m = msgs[i];
                    var b = BubbleLayout(m, 18, maxW);
                    y -= b.h;
                    DrawBubble(clip, b, m.role == "user" ? MAIN_W - 28 - b.w : 28, y);
                    y -= i > 0 && msgs[i - 1].role != m.role ? 14 : 8;
                }
                ctx.Gradient(1, TOP, MAIN_W - 2, 26, T.bg, new Color(1, 1, 1, 0));
                ctx.Text(ChatNote(), MAIN_W / 2, MAIN_H - 30, Fn(400, 12.5f), T.label2, lineH: 18, align: Align.Center);
            }), 0, 0);

            // Talk to Abe: start or stop the voice conversation (Voice.cs). Everything else on the
            // screen keeps working while it is on.
            void VoiceButton()
            {
                var busy = State.typing && !Voice.On;
                var key = Voice.Status + (busy ? "…" : "");
                if (key == voiceKey) return;
                voiceKey = key;
                main.Clear("voice");
                var o = Voice.On ? new BtnO { label = "Stop Talking", variant = "bordered", size = 17, onSelect = Voice.Stop }
                    : Voice.Status == "connecting" ? new BtnO { label = "Connecting…", variant = "bordered", size = 17, disabled = true }
                    : new BtnO { label = "Talk to " + GUIDE_NAME, icon = "mic", iconLeft = true, size = 17, onSelect = Voice.Start, disabled = busy };
                main.Add(Ui.Button(196, 46, o), MAIN_W - 28 - 196, 19, "voice");
            }

            void Update()
            {
                var s = State;
                var last = s.messages.Count > 0 ? s.messages[s.messages.Count - 1] : null;
                var replies = last != null && last.role == "bot" && !s.typing ? last.replies : null;
                var finished = last != null && last.done && !s.typing;
                VoiceButton();

                // While you are talking with Abe there is nothing to type into: only the suggestions stay.
                var talking = Voice.Status != "off";
                var nextKey = (finished ? "done" : replies == null ? "none" : string.Join("\u0001", replies)) + (talking ? "\u0001talking" : "");
                if (nextKey != chipsKey)
                {
                    chipsKey = nextKey;
                    main.Clear("chips");
                    draftEl = null;
                    if (finished)
                    {
                        composer = 110;
                        main.Add(Ui.Button(300, 54, new BtnO { label = "Review My Answers", icon = "check-circle", iconLeft = true, onSelect = () => Store.Go("review") }), (MAIN_W - 300) / 2, MAIN_H - 96, "chips");
                    }
                    else
                    {
                        // Suggestions to tap, then a line to answer in your own words, with "Why do you ask?" beside it.
                        var chips = (replies ?? new List<string>()).Where(r => r != Script.WHY).Select(r => Ui.Chip(r, false, () => Send(r))).ToList();
                        if (talking && replies != null && replies.Contains(Script.WHY)) chips.Add(Ui.Chip(Script.WHY, true, () => Send(Script.WHY)));
                        var rows = new List<List<(El chip, float x)>> { new List<(El, float)>() };
                        var x = 28f;
                        foreach (var c in chips)
                        {
                            if (x + c.w > MAIN_W - 28 && rows[rows.Count - 1].Count > 0) { rows.Add(new List<(El, float)>()); x = 28; }
                            rows[rows.Count - 1].Add((c, x));
                            x += c.w + 10;
                        }
                        var h = chips.Count > 0 ? rows.Count * 58 : 0;
                        composer = (talking ? 46 : 104) + h;
                        var chipsY = (talking ? MAIN_H - 40 : INPUT_Y) - h;
                        for (var i = 0; i < rows.Count; i++) foreach (var (c, cx) in rows[i]) main.Add(c, cx, chipsY + i * 58, "chips");

                        var edge = MAIN_W - 28;
                        var send = main.Add(new El(48, 48, ctx =>
                        {
                            ctx.Circle(24, 24, 24, T.tint);
                            ctx.Icon("chevron-right", 25, 24, 20, T.white, 2.6f);
                        }), edge - 48, INPUT_Y, "chips");
                        send.onSelect = SendDraft;
                        send.Redraw();
                        edge -= 58;
                        if (!talking && replies != null && replies.Contains(Script.WHY))
                        {
                            var why = Ui.Chip(Script.WHY, true, () => Send(Script.WHY));
                            main.Add(why, edge - why.w, INPUT_Y, "chips");
                            edge -= why.w + 10;
                        }
                        var w = edge - 28;
                        draftEl = main.Add(new El(w, 48, ctx =>
                        {
                            var open = typingHere || keyboard != null;
                            ctx.Rect(1, 1, w - 2, 46, 23, T.bg, open ? T.tint : Ui.C("#cfc6bd"), open ? 2 : 1.5f);
                            ctx.Icon("mic", 28, 24, 20, T.tint, 2);
                            var f = Fn(400, 18);
                            if (draft == "") ctx.Text(open ? "Listening for your answer…" : "Type or say your answer…", 50, 0, f, T.gray, lineH: 48);
                            else
                            {
                                // Keep the end of a long answer in view.
                                var shown = draft;
                                while (shown.Length > 1 && Ui.Measure(shown, f) > w - 74) shown = shown.Substring(1);
                                ctx.Text(shown, 50, 0, f, lineH: 48);
                            }
                            send.SetEnabled(draft.Trim() != "" && !State.typing);
                        }), 28, INPUT_Y, "chips");
                        draftEl.onSelect = OpenKeyboard;
                        draftEl.Redraw();
                        draftEl.Visible = send.Visible = !talking;
                    }
                }

                // On the right, with voice off: a number pad for the questions that take an amount, an
                // age or a number of years. While you are talking it stays clear.
                var step = Script.NextStep(s);
                var wantsNumber = Voice.Status == "off" && replies != null && !finished && s.pending == null && step != null && Calc.FIELD[step].kind != "choice";
                var nextPad = wantsNumber ? step : null;
                if (nextPad != padKey)
                {
                    padKey = nextPad;
                    ClearRight();
                    if (wantsNumber)
                    {
                        var kind = Calc.FIELD[step].kind;
                        NumberPad(Calc.FIELD[step].label, kind == "money", new PadAction
                        {
                            label = "Send", icon = "chevron-right",
                            onSelect = v => Send(kind == "money" ? Calc.FormatMoney(v.Value) : v.Value.ToString(), scripted: true),
                            disabled = v => v == null,
                        }, hint: kind == "money" ? "A rough number is fine. Or just say it: point at the answer line." : kind == "years" ? "A number of years, from 1 to 70." : "In years. Use 0 for a baby.");
                    }
                }

                var facts = Facts(s.profile, s.form);
                var key = string.Join("\u0001", facts.Select(f => f.id + "=" + f.value)) + (s.typing ? "…" : "");
                if (key != knowsKey) { knowsKey = key; ShowKnows(); }
                draftEl?.Redraw();
                log.Redraw();
            }

            // The chat opens by talking: Abe greets you out loud and asks the open question. If voice
            // can't start, his written opening lines appear instead and tapping and typing take over.
            // Both change state, and the screen is not built yet, so they start on the next frame.
            var begin = !State.typing && (State.messages.Count == 0 || Script.NextStep(State) != null);
            var opening = false; // waiting to hear whether voice connected
            Update();

            return new Screen
            {
                main = main,
                update = Update,
                dispose = () =>
                {
                    Voice.Stop();
                    GuideHome();
                    guideCard.Visible = true;
                    left.Clear("knows");
                    knows = null;
                    draftEl = null;
                    typingHere = false;
                    if (keyboard != null) { keyboard.active = false; keyboard = null; }
                },
                tick = (t, dt) =>
                {
                    if (begin)
                    {
                        begin = false;
                        Voice.Start(); // does nothing in the editor's screenshot pass
                        opening = true;
                    }
                    if (opening && Voice.Status != "connecting")
                    {
                        opening = false;
                        if (!Voice.On && State.messages.Count == 0) BeginChat();
                    }
                    if (Voice.Version != voiceVersion) { voiceVersion = Voice.Version; caption = Voice.Caption; Update(); }
                    var p = Mathf.FloorToInt(t * 4) % 3;
                    var dots = State.typing || Voice.Hearing || Voice.Status == "connecting";
                    // Abe's words arrive a few at a time; showing them about six times a second is plenty.
                    captionWait -= dt;
                    if (caption != Voice.Caption && captionWait <= 0) { caption = Voice.Caption; captionWait = 0.16f; phase = p; log.Redraw(); }
                    else if (p != phase && dots) { phase = p; log.Redraw(); }
                    if (keyboard == null) return;
                    if (keyboard.text != draft) { draft = keyboard.text ?? ""; draftEl?.Redraw(); }
                    if (keyboard.status == TouchScreenKeyboard.Status.Done) { keyboard = null; SendDraft(); }
                    else if (keyboard.status != TouchScreenKeyboard.Status.Visible) { keyboard = null; draftEl?.Redraw(); }
                },
                mood = () => Voice.On ? (Voice.Speaking ? "speaking" : "listening") : State.typing || Voice.Status == "connecting" ? "typing" : "idle",
            };
        }

        // ---------- Review ----------
        static readonly Dictionary<string, string> HINT = new Dictionary<string, string>
        {
            ["income"] = "Yearly, before taxes.",
            ["support"] = "Yearly amount your family would need. Many people use 70–80% of income.",
            ["years"] = "How long the support should last, from 1 to 70 years.",
            ["youngestAge"] = "In years. Use 0 for a baby.",
            ["mortgage"] = "What’s left to pay. Enter 0 if you don’t have one.",
            ["otherDebts"] = "Car loans, student loans, and credit cards. Enter 0 for none.",
            ["finalExpenses"] = "An amount for funeral costs and final bills.",
            ["education"] = "Education or another big future cost, in total.",
            ["existing"] = "Through work or on your own. Enter 0 for none.",
            ["savings"] = "Savings or investments your family could use.",
        };
        static readonly string[][] COLUMNS = { new[] { "household", "income" }, new[] { "debts", "future", "resources" } };

        static Screen Review()
        {
            var main = MainPanel();
            const float COL_W = (MAIN_W - M * 2 - 16) / 2;
            string editing = null;
            Action rows = null, side = null;

            main.Add(Ui.Paint(MAIN_W, 112, ctx =>
            {
                ctx.Text("Check your answers", M, 28, Fn(700, 34), lineH: 41, spacing: -0.4f);
                ctx.Text("Make sure everything looks right. Point at any answer to change it.", M, 72, Fn(400, 17), T.label2, lineH: 24);
            }), 0, 0);

            void ConfirmAll()
            {
                Store.Set(s =>
                {
                    foreach (var f in Calc.FIELDS)
                    {
                        var field = s.profile[f.id];
                        if (field.status == Status.Proposed) s.profile[f.id] = new Field { status = Status.Confirmed, num = field.num, choice = field.choice, fromForm = field.fromForm };
                        else if (f.role == "optional" && (field.status == Status.Empty || field.status == Status.Unknown)) s.profile[f.id] = Field.Skipped();
                    }
                });
                Store.Go("results");
            }

            void Edit(string id) { editing = id; side(); rows(); }

            rows = () =>
            {
                main.Clear("rows");
                var profile = State.profile;
                var missing = Calc.MissingRequired(profile);
                var household = profile["household"].choice;
                var showAge = household == "kids" || household == "both" || profile["youngestAge"].status != Status.Empty;
                for (var c = 0; c < COLUMNS.Length; c++)
                {
                    var x = M + c * (COL_W + 16);
                    var y = 122f;
                    foreach (var g in Calc.GROUPS.Where(gr => COLUMNS[c].Contains(gr.id)))
                    {
                        var fields = Calc.FIELDS.Where(f => f.group == g.id && (f.id != "youngestAge" || showAge)).ToList();
                        main.Add(Ui.Paint(COL_W, 28, ctx => ctx.Text(g.title, 14, 0, Fn(600, 16), lineH: 24)), x, y, "rows");
                        y += 28;
                        main.Add(Ui.Card(COL_W, fields.Count * 56, r: 16, shadow: false), x, y, "rows");
                        for (var i = 0; i < fields.Count; i++)
                        {
                            var f = fields[i];
                            var field = profile[f.id];
                            var flagged = f.role == "required" && missing.Contains(f.id);
                            main.Add(Ui.Row(COL_W, 56, new RowO
                            {
                                title = f.label, first = i == 0, chevron = true, selected = editing == f.id,
                                value = field.status == Status.Empty ? "Add" : Calc.FormatField(f.id, field),
                                valueColor = flagged ? T.warning : field.status == Status.Empty ? T.tint : editing == f.id ? T.tint : T.label2,
                                note = f.role == "optional" ? "Optional" : null,
                                onSelect = () => Edit(f.id),
                            }), x, y + i * 56, "rows");
                        }
                        y += fields.Count * 56 + 14;
                    }
                }
            };

            void Editor(string id, Field field)
            {
                var def = Calc.FIELD[id];
                void Close() { editing = null; side(); rows(); }
                void Save(Field next) { Store.SetField(id, next); Close(); }
                void Alt(float y)
                {
                    var optional = def.role == "optional";
                    right.Add(Ui.Button(optional ? 130 : 200, 44, new BtnO { label = "I’m Not Sure", variant = "inverse", size = 16, onSelect = () => Save(Field.Unknown()) }), 0, y);
                    if (optional) right.Add(Ui.Button(140, 44, new BtnO { label = "Leave It Out", variant = "inverse", size = 16, onSelect = () => Save(Field.Skipped()) }), 140, y);
                    right.Add(Ui.Button(optional ? 120 : 200, 44, new BtnO { label = "Cancel", variant = "plain", size = 16, onSelect = Close }), optional ? 300 : 220, y);
                }

                if (def.kind == "choice")
                {
                    var entries = Calc.HOUSEHOLD;
                    right.Add(Ui.Card(SIDE_W, 60 + entries.Length * 58 + 12, r: 20), 0, 100);
                    right.Add(Ui.Paint(SIDE_W, 56, ctx => ctx.Text(def.label, 24, 18, Fn(600, 19), lineH: 26)), 0, 100);
                    for (var i = 0; i < entries.Length; i++)
                    {
                        var (v, label) = entries[i];
                        right.Add(Ui.Row(SIDE_W - 16, 58, new RowO { title = label, first = i == 0, check = field.choice == v, onSelect = () => Save(Field.Of(Status.Confirmed, v)) }), 8, 156 + i * 58);
                    }
                    Alt(180 + entries.Length * 58);
                    return;
                }

                var (min, max) = def.kind == "years" ? (1L, 70L) : def.kind == "age" ? (0L, 30L) : (0L, long.MaxValue);
                NumberPad(def.label, def.kind == "money", new PadAction
                {
                    label = "Save", disabled = v => v == null,
                    onSelect = v =>
                    {
                        if (v < min || v > max) { pad.fail($"Enter a number from {min} to {max}."); return; }
                        Save(Field.Of(Status.Confirmed, v.Value));
                    },
                }, value: field.num, hint: HINT[id]);
                Alt(592);
            }

            side = () =>
            {
                ClearRight();
                var profile = State.profile;
                if (editing != null) { Editor(editing, profile[editing]); return; }

                var missing = Calc.MissingRequired(profile);
                var ok = missing.Count == 0;
                var title = ok ? "Everything we need is here" : missing.Count == 1 ? "One answer still needed" : $"{missing.Count} answers still needed";
                var msg = ok
                    ? "Optional answers you leave blank won’t be counted."
                    : $"We need {ListJoin(missing.Select(id => Calc.FIELD[id].label.ToLowerInvariant()).ToList())} before we can do the math. A good guess is fine.";
                var lines = Ui.Wrap(msg, Fn(400, 15), SIDE_W - 76);
                var h = 60 + lines.Count * 21 + (ok ? 0 : 44);
                right.Add(Ui.Card(SIDE_W, h, r: 20), 0, 120);
                right.Add(Ui.Paint(SIDE_W, h, ctx =>
                {
                    ctx.Icon(ok ? "check-circle" : "exclamation", 32, 31, 24, ok ? T.success : T.warning, 2);
                    ctx.Text(title, 56, 20, Fn(600, 17), lineH: 22);
                    ctx.Text(string.Join("\n", lines), 56, 46, Fn(400, 15), T.label2, lineH: 21);
                }), 0, 120);
                if (!ok)
                {
                    var label = $"Fill In {Calc.FIELD[missing[0]].label}";
                    right.Add(Ui.Button(Mathf.Min(SIDE_W - 60, Ui.Measure(label, Fn(600, 16)) + 28), 36, new BtnO { label = label, variant = "plain", size = 16, onSelect = () => Edit(missing[0]) }), 44, 120 + h - 46);
                }
                right.Add(Ui.Button(SIDE_W, 58, new BtnO { label = "Confirm & See Results", size = 20, disabled = !ok, onSelect = ConfirmAll }), 0, 140 + h);
                right.Add(Ui.Button(SIDE_W, 52, new BtnO { label = "Back to Chat", variant = "inverse", icon = "chevron-left", iconLeft = true, onSelect = () => Store.Go("chat") }), 0, 212 + h);
            };

            Say(Bot("Here’s everything you told me. Nothing is final until you confirm it."), Bot("Only confirmed answers reach the math. Anything marked “not sure” needs a best guess first."));
            rows();
            side();
            return new Screen { main = main, update = () => { rows(); if (editing == null) side(); } };
        }

        // ---------- Results ----------
        // One color per term, shared by the list on the card and the blocks in front of you.
        static readonly Dictionary<string, Color> TERM_COLOR = new Dictionary<string, Color>
        {
            ["support"] = T.tint, ["mortgage"] = T.shiraz, ["otherDebts"] = T.hue.orange, ["finalExpenses"] = T.hue.brown, ["education"] = T.hue.indigo,
            ["existing"] = T.partner, ["savings"] = T.hue.green, ["gap"] = T.highlight,
        };

        // The results deck, from the site (codelinc_frontend/src/results/Results.tsx): the estimate
        // explained one piece at a time. Each slide says what to read on the card, what Abe points
        // out in the room (look), and what the room shows: the year posts (years: low, up or down)
        // and whether the stacks include what is already there and the gap.
        class Slide
        {
            public string eyebrow, title, body, years = "low";
            public string[] look;
            public bool have = true, gap = true;
        }
        const int SLIDES = 7;
        static Action<int> resultsSlide; // lets the editor's screenshot pass turn to a slide

        static Slide[] Deck(Profile p, Estimate r)
        {
            var years = p["years"].Number;
            var support = p["support"].Number;
            var income = p["income"].status == Status.Confirmed ? p["income"].Number : (long?)null;
            var startAge = p["youngestAge"].status == Status.Confirmed && p["household"].choice != "none" ? p["youngestAge"].Number : (long?)null;
            var supportTotal = r.needs.First(t => t.id == "support").value;
            var extras = r.needs.Where(t => t.id != "support" && t.included && t.value > 0).ToList();
            var held = r.resources.Where(t => t.included && t.value > 0).ToList();
            var covered = r.totalNeeds > 0 ? Mathf.RoundToInt(Mathf.Min(1f, (float)r.totalResources / r.totalNeeds) * 100) : 0;
            var gap = r.additional > 0;
            string Named(IEnumerable<Term> terms, Func<Term, string> label) => ListJoin(terms.Select(t => $"{label(t).ToLowerInvariant()} ({Calc.FormatMoney(t.value)})").ToList());

            var everyday = $"You said your family would need {Calc.FormatMoney(support)} a year for {Plural(years, "year")}. Each year adds one more. Stacked up, that comes to {Calc.FormatMoney(supportTotal)}.";
            if (income != null && income > 0) everyday += $" That’s about {Mathf.RoundToInt((float)support / income.Value * 100)}% of the {Calc.FormatMoney(income.Value)} you earn now.";
            if (startAge != null) everyday += $" By the end, your youngest would be {startAge + years}.";

            return new[]
            {
                new Slide
                {
                    eyebrow = "The short version",
                    title = gap ? $"About {Calc.FormatMoney(r.additional)} more coverage would help protect your family" : "You’re covered for everything you listed",
                    body = "This is a starting point for a conversation, not a verdict, and nothing here needs a decision today. Point at the arrow and I’ll show you where the number comes from, one piece at a time.",
                    look = new[] { "The two stacks in front of you are the whole estimate: what your family would need, and what you already have.", "Point at the arrow under the slide and I’ll take it a piece at a time." },
                },
                new Slide
                {
                    eyebrow = "Everyday costs", title = "Keeping life steady at home", body = everyday, years = "up", have = false, gap = false,
                    look = new[] { "Look down and to your right, then keep turning. Each post on the ring around you is one more year.", $"By the last post, it has added up to {Calc.FormatMoney(supportTotal)}." },
                },
                new Slide
                {
                    eyebrow = "One-time costs", have = false, gap = false,
                    title = extras.Count > 0 ? "Costs that only come up once" : "No one-time costs to add",
                    body = extras.Count > 0
                        ? $"On top of everyday costs, you listed {Named(extras, t => t.label)}. All together, your family would need {Calc.FormatMoney(r.totalNeeds)}."
                        : $"You didn’t list any debts or one-time costs, so the total your family would need stays at {Calc.FormatMoney(r.totalNeeds)}.",
                    look = new[] { "The stack in front of you is everything your family would need. Each color is one of the costs in the list." },
                },
                new Slide
                {
                    eyebrow = "What you already have", gap = false,
                    title = r.totalResources > 0 ? $"Good news: {Calc.FormatMoney(r.totalResources)} is already in place" : "Starting from zero is common",
                    body = r.totalResources > 0
                        ? $"Your {Named(held, t => t.id == "existing" ? "Life insurance" : "Savings")} would go toward that total. That’s {covered}% of it already taken care of."
                        : "Many families don’t have coverage or savings set aside yet. That’s exactly what an estimate like this is for.",
                    look = new[] { r.totalResources > 0 ? "A second stack has come up beside the first. That is what you already have." : "The second stack is empty for now, and that is a common place to start." },
                },
                new Slide
                {
                    eyebrow = "The gap",
                    title = gap ? $"What’s left: {Calc.FormatMoney(r.additional)}" : "No gap for what you listed",
                    body = gap
                        ? "The orange piece is the difference between what your family would need and what you already have. It’s the amount of additional coverage worth talking through with a licensed professional."
                        : "What you have meets the needs you listed. It’s still worth checking again when life changes, like a new home or a new baby.",
                    look = new[] { gap ? "The glowing block is the gap. It brings the second stack level with the first." : "Both stacks reach the same height: for what you listed, there is no gap." },
                },
                new Slide
                {
                    eyebrow = "Over time", title = "The need gets smaller every year", years = "down",
                    body = $"Everyday costs only matter for the years your family depends on your income. Each year that passes leaves one less year to cover, so after {Plural(years, "year")} that part reaches zero. Term insurance is built around this idea: it covers a set number of years.",
                    look = new[] { "Look around you again. The posts now step down: each year that passes leaves one less to cover." },
                },
                new Slide
                {
                    eyebrow = "Try it yourself", title = "See how a change moves the number",
                    body = "Change a number on your right and watch the stacks move. Your summary updates too.",
                    look = new[] { "Use the + and − on your right. The stacks in front of you and the ring around you follow.", "It’s a starting point for a conversation with a licensed professional, not a quote." },
                },
            };
        }

        // Two stacks on a tray at waist height: what the family would need, and what is already
        // there, with the gap as a glowing block that brings the second stack level with the first.
        class Stacks
        {
            class Block { public Transform mesh; public Material material; public int column; public float h, target; }
            class Sign { public Panel panel; public El el; public string title, value; public Color? color; }

            const float MAX = 0.24f, SIDE = 0.15f;
            readonly Transform group;
            readonly List<(string id, Block block)> blocks = new List<(string, Block)>();
            readonly Sign needs, have, gap;
            readonly List<Material> materials = new List<Material>();

            public Stacks()
            {
                group = new GameObject("Stacks").transform;
                group.SetParent(App.rig, false);
                group.localPosition = new Vector3(0, 0.66f, 1.12f);
                Mat.Spawn("Tray", MeshGen.Cylinder(0.34f, 0.02f), Keep(Mat.Lit(Color.white)), group);
                Mat.Spawn("Rim", MeshGen.Torus(0.34f, 0.006f, upright: false, across: 8), Keep(Mat.Unlit(T.highlight)), group).localPosition = new Vector3(0, 0.01f, 0);

                (string id, int column)[] order = { ("support", 0), ("mortgage", 0), ("otherDebts", 0), ("finalExpenses", 0), ("education", 0), ("existing", 1), ("savings", 1), ("gap", 1) };
                foreach (var (id, column) in order)
                {
                    var isGap = id == "gap";
                    var color = TERM_COLOR[id];
                    if (isGap) color.a = 0.38f;
                    var material = Keep(Mat.Lit(color, transparent: isGap));
                    if (isGap) material.SetColor("_Emission", T.highlight * 0.5f);
                    var mesh = Mat.Spawn(id, MeshGen.UnitBox(), material, group);
                    blocks.Add((id, new Block { mesh = mesh, material = material, column = column }));
                }

                needs = MakeSign("Your family would need", -0.125f);
                have = MakeSign("You already have", 0.125f);
                gap = MakeSign("The gap", 0.39f);
                gap.color = T.highlightText;
                gap.panel.group.localPosition = new Vector3(0.39f, 0.06f, -0.03f);
                gap.panel.group.localRotation = Quaternion.Euler(0.25f * Mathf.Rad2Deg, 0, 0);
            }

            Material Keep(Material m) { materials.Add(m); return m; }

            Sign MakeSign(string text, float x)
            {
                var s = new Sign { title = text };
                s.panel = new Panel(230, 62, group, card: false);
                s.panel.group.localScale = Vector3.one * 0.62f;
                s.panel.group.localPosition = new Vector3(x, 0.06f, -0.24f);
                s.panel.group.localRotation = Quaternion.Euler(0.6f * Mathf.Rad2Deg, 0, 0); // leaning back, to be read from above
                s.el = s.panel.Add(new El(230, 62, ctx =>
                {
                    ctx.Rect(0, 0, 230, 62, 16, Ui.C(255, 255, 255, 0.94f));
                    ctx.Text(s.title, 115, 8, Fn(500, 14), T.label2, lineH: 18, align: Align.Center);
                    ctx.Text(s.value ?? "", 115, 27, Fn(700, 22), s.color ?? T.label, lineH: 28, align: Align.Center);
                }), 0, 0);
                return s;
            }

            // showHave, showGap: the slide deck brings in what is already there, and then the gap, a step at a time.
            public void Set(Estimate r, bool showHave = true, bool showGap = true)
            {
                var scale = MAX / Mathf.Max(r.totalNeeds, r.totalResources, 1);
                foreach (var t in r.needs) blocks.First(b => b.id == t.id).block.target = t.included ? t.value * scale : 0;
                foreach (var t in r.resources) blocks.First(b => b.id == t.id).block.target = t.included && showHave ? t.value * scale : 0;
                blocks.First(b => b.id == "gap").block.target = showGap ? r.additional * scale : 0;
                have.panel.group.gameObject.SetActive(showHave);
                needs.value = Calc.FormatMoney(r.totalNeeds);
                have.value = Calc.FormatMoney(r.totalResources);
                gap.value = Calc.FormatMoney(r.additional);
                gap.panel.group.gameObject.SetActive(showGap && r.additional > 0);
                foreach (var s in new[] { needs, have, gap }) s.el.Redraw();
            }

            public void Tick(float t, float dt)
            {
                float[] top = { 0.01f, 0.01f };
                foreach (var (id, b) in blocks)
                {
                    b.h += (b.target - b.h) * Mathf.Min(1, dt * 5);
                    b.mesh.gameObject.SetActive(b.h > 0.0015f);
                    b.mesh.localScale = new Vector3(SIDE, Mathf.Max(b.h, 0.001f), SIDE);
                    b.mesh.localPosition = new Vector3(b.column == 1 ? 0.12f : -0.12f, top[b.column] + b.h / 2, 0);
                    top[b.column] += b.h;
                    if (id != "gap") continue;
                    var c = TERM_COLOR["gap"];
                    c.a = 0.34f + 0.1f * Mathf.Sin(t * 2.4f);
                    b.material.SetColor("_Color", c);
                    var at = gap.panel.group.localPosition;
                    gap.panel.group.localPosition = new Vector3(at.x, Mathf.Max(0.1f, b.mesh.localPosition.y), at.z);
                }
                group.localRotation = Quaternion.Euler(0, Mathf.Sin(t * 0.3f) * 0.12f * Mathf.Rad2Deg, 0);
            }

            // In the editor's screenshot pass there are no frames, so jump straight to the final heights.
            public void Settle() => Tick(0, 1);

            public void Dispose()
            {
                foreach (var s in new[] { needs, have, gap }) s.panel.Dispose();
                foreach (var m in materials) Ui.Kill(m);
                Ui.Kill(group.gameObject);
            }
        }

        static Screen Results()
        {
            var main = MainPanel();
            (Profile p, Estimate r, bool ready) Now()
            {
                var p = State.profile;
                var unconfirmed = Calc.FIELDS.Any(f => f.role == "required" && p[f.id].status != Status.Confirmed);
                var r = Calc.Calculate(p);
                return (p, r, !unconfirmed && r.ready);
            }

            if (!Now().ready)
            {
                main.Add(Ui.Paint(MAIN_W, 300, ctx =>
                {
                    ctx.Circle(MAIN_W / 2, 60, 36, T.fill3);
                    ctx.Icon("check-circle", MAIN_W / 2, 60, 36, T.tint, 2.2f);
                    ctx.Text("Let’s check your answers first", MAIN_W / 2, 116, Fn(600, 24), lineH: 32, align: Align.Center);
                    ctx.Text("Once you’ve confirmed them, we’ll show your estimate and the math behind it.", MAIN_W / 2, 156, Fn(400, 17), T.label2, maxW: 420, lineH: 24, align: Align.Center);
                }), 0, 150);
                main.Add(Ui.Button(240, 52, new BtnO { label = "Review Answers", onSelect = () => Store.Go("review") }), (MAIN_W - 240) / 2, 400);
                Say(Bot("We’re almost there. I just need you to confirm your answers before I do the math."));
                return new Screen { main = main };
            }

            var stacks = new Stacks();
            const float COL = 334;
            const float X2 = MAIN_W - M - COL;
            string copied = null;
            var slide = 0;
            Action refresh = null;

            var sheet = main.Add(new El(MAIN_W, MAIN_H, ctx =>
            {
                var (p, r, _) = Now();
                if (!r.ready) return;
                ctx.Text("Here’s what we found", M, 26, Fn(700, 32), lineH: 40, spacing: -0.4f);

                // The brand stat card, with the orange arc in its corner.
                ctx.Rect(M, 82, COL, 118, 20, T.tint);
                ctx.Clip(M, 82, COL, 118).Circle(M + COL - 6, 82 + 118 + 34, 78, null, T.highlight, 6);
                ctx.Text(Calc.FormatMoney(r.additional), M + 20, 94, Fn(700, 40), T.white, lineH: 46);
                ctx.Text(r.additional > 0 ? "Estimated additional coverage to consider" : "No additional coverage needed for what you listed", M + 20, 144,
                    Fn(400, 15), T.onBrandMuted, maxW: COL - 110, lineH: 20);

                // The slide: one piece of the estimate at a time, as on the site's results deck.
                var step = Deck(p, r)[slide];
                ctx.Text($"{step.eyebrow.ToUpperInvariant()} · {slide + 1} OF {SLIDES}", M + 2, 216, Fn(700, 12.5f), T.highlightText, lineH: 18, spacing: 0.6f);
                var titleH = ctx.Text(step.title, M + 2, 238, Fn(700, 21), maxW: COL - 4, lineH: 27, spacing: -0.2f);
                ctx.Text(step.body, M + 2, 246 + titleH, Fn(400, 15.5f), T.label2, maxW: COL - 4, lineH: 22);
                // Which slide you are on.
                for (var i = 0; i < SLIDES; i++)
                {
                    var on = i == slide;
                    ctx.Rect(M + COL / 2 - (SLIDES * 14 + 10) / 2f + i * 14 + (i > slide ? 10 : 0), 607, on ? 18 : 8, 8, 4, on ? T.tint : i < slide ? Ui.C("#c9a3b3") : Ui.C("#d9d2cc"));
                }

                // How we got there: every term, in the order the math uses it.
                ctx.Text("How we got there", X2 + 14, 84, Fn(600, 17), lineH: 24);
                var lines = new List<(string id, string title, string sub, string value, bool bold, bool tint)>();
                foreach (var t in r.needs.Where(n => n.included)) lines.Add((t.id, t.label, t.detail, $"+ {Calc.FormatMoney(t.value)}", false, false));
                lines.Add((null, "What your family would need", null, Calc.FormatMoney(r.totalNeeds), true, false));
                foreach (var t in r.resources.Where(n => n.included)) lines.Add((t.id, t.label, null, $"− {Calc.FormatMoney(t.value)}", false, false));
                lines.Add(("gap", "Estimated additional coverage", null, Calc.FormatMoney(r.additional), true, true));
                var laid = lines.Select(l =>
                {
                    var f = Fn(l.bold ? 700 : 500, 16);
                    var vw = Ui.Measure(l.value, f);
                    var titleLines = Ui.Wrap(l.title, f, COL - 32 - vw - 12 - (l.id != null ? 18 : 0));
                    return (l, f, titleLines, h: Mathf.Max(40, titleLines.Count * 20 + (l.sub != null ? 18 : 0) + 16));
                }).ToList();
                var total = laid.Sum(l => l.h);
                ctx.Rect(X2 + 0.5f, 114.5f, COL - 1, total - 1, 16, T.bg, T.edge, 1);
                var y = 114f;
                for (var i = 0; i < laid.Count; i++)
                {
                    var (l, f, titleLines, h) = laid[i];
                    if (i > 0) ctx.Fill(X2 + 14, y, COL - 14, 1, T.separator);
                    var x = X2 + 14;
                    var th = titleLines.Count * 20 + (l.sub != null ? 18 : 0);
                    var ty = y + (h - th) / 2f;
                    if (l.id != null)
                    {
                        ctx.Rect(x, ty + 5, 10, 10, 3, TERM_COLOR[l.id]);
                        x += 18;
                    }
                    ctx.Text(string.Join("\n", titleLines), x, ty, f, lineH: 20);
                    if (l.sub != null) ctx.Text(l.sub, x, ty + titleLines.Count * 20, Fn(400, 13.5f), T.label2, lineH: 18);
                    ctx.Text(l.value, X2 + COL - 14, y, f, l.tint ? T.tint : l.bold ? T.label : T.label2, lineH: h, align: Align.Right);
                    y += h;
                }
                if (r.leftOut.Count > 0) ctx.Text($"Not included: {string.Join(", ", r.leftOut).ToLowerInvariant()}.", X2 + 14, y + 8, Fn(400, 13), T.label2, maxW: COL - 28, lineH: 18);
            }), 0, 0);

            // What-if controls, summary and the two kinds of insurance, on the right.
            void Adjust(string id, long delta, long min, long max)
            {
                copied = null;
                Store.SetField(id, Field.Of(Status.Confirmed, Math.Min(max, Math.Max(min, State.profile[id].Number + delta))));
            }
            right.Add(Ui.Paint(SIDE_W, 30, ctx => ctx.Text("Try a different scenario", 16, 0, Fn(600, 17), lineH: 24)), 0, 0);
            right.Add(Ui.Card(SIDE_W, 136, r: 20), 0, 30);
            var scenario = right.Add(new El(SIDE_W, 136, ctx =>
            {
                var p = State.profile;
                var items = new[] { ("Years of support", Plural(p["years"].Number, "year")), ("Yearly support", Calc.FormatMoney(p["support"].Number)) };
                for (var i = 0; i < items.Length; i++)
                {
                    if (i > 0) ctx.Fill(18, 68, SIDE_W - 18, 1, T.separator);
                    ctx.Text(items[i].Item1, 18, 12 + i * 68, Fn(500, 17), lineH: 22);
                    ctx.Text(items[i].Item2, 18, 35 + i * 68, Fn(400, 15), T.label2, lineH: 20);
                }
            }), 0, 30);
            var steppers = new List<(Btn button, Func<bool> limit)>();
            (string id, long step, long min, long max)[] knobs = { ("years", 1, 1, 70), ("support", 5000, 0, 10_000_000) };
            for (var i = 0; i < knobs.Length; i++)
            {
                var (id, step, min, max) = knobs[i];
                foreach (var dir in new[] { -1, 1 })
                {
                    var b = right.Add(Ui.Button(52, 40, new BtnO { label = dir < 0 ? "−" : "+", variant = "bordered", size = 22, onSelect = () => Adjust(id, dir * step, min, max) }), SIDE_W - 16 - (dir < 0 ? 112 : 52), 44 + i * 68);
                    steppers.Add((b, () => State.profile[id].Number == (dir < 0 ? min : max)));
                }
            }
            right.Add(Ui.Paint(SIDE_W, 24, ctx => ctx.Text("Changes here update your answers, the math and the blocks.", 16, 0, Fn(400, 13), T.label2, lineH: 18)), 0, 174);

            // Back and forward through the deck, under the slide.
            void GoTo(int i)
            {
                slide = Mathf.Clamp(i, 0, SLIDES - 1);
                refresh();
                if (!Application.isPlaying) stacks.Settle();
            }
            Btn Arrow(string icon, float x, Action onSelect) => main.Add(Ui.Button(64, 44, new BtnO { label = "", icon = icon, variant = "bordered", size = 20, onSelect = onSelect }), x, 589);
            var prev = Arrow("chevron-left", M, () => GoTo(slide - 1));
            var next = Arrow("chevron-right", M + COL - 64, () => GoTo(slide + 1));

            var copy = right.Add(Ui.Button(SIDE_W, 56, new BtnO
            {
                label = "Copy Summary", size = 19,
                onSelect = () =>
                {
                    var (p, r, _) = Now();
                    try { GUIUtility.systemCopyBuffer = Calc.SummaryText(p, r); copied = "ok"; } catch (Exception) { copied = "fail"; }
                    refresh();
                },
            }), 0, 212);
            right.Add(Ui.Button(SIDE_W, 50, new BtnO { label = "Change My Answers", variant = "inverse", onSelect = () => Store.Go("review") }), 0, 280);

            right.Add(Ui.Paint(SIDE_W, 30, ctx => ctx.Text("Good to know", 16, 0, Fn(600, 17), lineH: 24)), 0, 352);
            right.Add(Ui.Card(SIDE_W, 252, r: 20), 0, 382);
            right.Add(Ui.Paint(SIDE_W, 252, ctx =>
            {
                var kinds = new[]
                {
                    ("calendar", T.hue.orange, "Term insurance", "Covers a set number of years. Often used for needs with an end date, like raising kids or paying off a mortgage."),
                    ("shield", T.hue.teal, "Permanent insurance", "Designed to last longer, and may include features beyond the death benefit, depending on the product."),
                };
                for (var i = 0; i < kinds.Length; i++)
                {
                    var (ic, hue, title, text) = kinds[i];
                    var y = 16 + i * 122;
                    if (i > 0) ctx.Fill(62, y - 8, SIDE_W - 62, 1, T.separator);
                    ctx.Rect(18, y + 2, 32, 32, 8, hue);
                    ctx.Icon(ic, 34, y + 18, 19, T.white, 2);
                    ctx.Text(title, 62, y, Fn(500, 17), lineH: 22);
                    ctx.Text(text, 62, y + 24, Fn(400, 14.5f), T.label2, maxW: SIDE_W - 84, lineH: 20);
                }
            }), 0, 382);

            refresh = () =>
            {
                var (_, r, ready) = Now();
                if (!ready) return; // answers were just cleared; Start Over is taking us home
                sheet.Redraw();
                scenario.Redraw();
                foreach (var (b, limit) in steppers) b.Set(o => o.disabled = limit());
                copy.Set(o =>
                {
                    o.label = copied == "ok" ? "Summary Copied" : copied == "fail" ? "Copy Isn’t Available Here" : "Copy Summary";
                    o.variant = copied != null ? "inverse" : "filled";
                });
                var step = Deck(State.profile, r)[slide];
                prev.Set(o => o.disabled = slide == 0);
                next.Set(o => o.disabled = slide == SLIDES - 1);
                // What is in the room for this slide: the two stacks in front, and the ring of years around.
                stacks.Set(r, step.have, step.gap);
                Picture.Years = step.years;
                Say(step.look.Select(line => Bot(line)).ToArray());
            };
            Picture.ShowBlocks = false; // the tray in front shows the same amounts as two stacks
            refresh();
            if (!Application.isPlaying) stacks.Settle();
            resultsSlide = GoTo;

            return new Screen
            {
                main = main, update = refresh, tick = stacks.Tick,
                dispose = () =>
                {
                    stacks.Dispose();
                    Picture.ShowBlocks = true;
                    Picture.Years = "low";
                    resultsSlide = null;
                },
            };
        }

        // ---------- routing ----------
        static void Fade(float k)
        {
            current.main.SetFade(k);
            right.SetFade(k);
            current.main.group.localPosition = App.FOCUS + new Vector3(0, 0, (1 - k) * 0.12f);
        }

        static void Show()
        {
            if (current != null)
            {
                current.dispose?.Invoke();
                current.main.Dispose();
            }
            current = null; // a screen can change state while it builds; the old one must not hear it
            ClearRight();
            ResetStartOver();
            var route = Store.Route;
            startOver.Visible = route != "home";
            stepper.Redraw();
            var at = Array.FindIndex(STEPS, st => st.id == route);
            for (var i = 0; i < stepLinks.Length; i++) stepLinks[i].Visible = i < at;
            current = route switch { "prepare" => Prepare(), "chat" => Chat(), "review" => Review(), "results" => Results(), _ => Home() };
            appear = 0;
            Fade(0);
        }

        public static void Start()
        {
            current = null;
            pad = null;
            guideLines = new List<Message>();
            knows = null;
            draft = "";
            typingHere = false;
            keyboard = null;
            draftEl = null;
            BuildFrame();
            var kb = UnityEngine.InputSystem.Keyboard.current;
            if (kb != null) { kb.onTextInput -= OnChar; kb.onTextInput += OnChar; }
            Store.RouteChanged += Show;
            Store.Changed += () => current?.update?.Invoke();
            Show();
            if (!Application.isPlaying) { appear = 1; Fade(1); }
        }

        // For the editor's screenshot pass: show a screen fully faded in.
        public static void Jump(string route)
        {
            Store.Go(route);
            appear = 1;
            Fade(1);
            picture.Settle(RingUp());
        }

        // The ring shows once there are answers to draw: in the chat, on Review and on Results.
        static bool RingUp() => Store.Route == "chat" || Store.Route == "review" || Store.Route == "results";

        // For the editor's screenshot pass: turn the results deck to a slide.
        public static void TurnTo(int index)
        {
            resultsSlide?.Invoke(index);
            picture.Settle(RingUp());
        }

        public static void Frame(float t, float dt)
        {
            if (current == null) return;
            // With the ring up there is something behind the wearer worth turning to see, so the
            // panels stay where they are when they look away.
            App.FollowGaze = !RingUp();
            picture.Tick(t, dt, RingUp());
            TypeKeys();
            if (confirmUntil > 0 && Time.time > confirmUntil) ResetStartOver();
            if (appear < 1)
            {
                appear = Mathf.Min(1, appear + dt / 0.32f);
                Fade(1 - Mathf.Pow(1 - appear, 3));
            }
            current.tick?.Invoke(t, dt);
            guide.Tick(t, current.mood?.Invoke() ?? "idle", Voice.Level);
        }
    }
}
