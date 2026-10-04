// A small UI kit for the headset, drawn to look like the 2D frontend's App Kit
// (codelinc_frontend/src/kit). It mirrors advisor3d/src/xr/ui.js: layout is in design px,
// like CSS, and PX converts to meters. Each element draws itself with a Ctx (rounded
// rectangles, text, icons), so the screens read almost line for line like the WebXR ones.
using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.TextCore.LowLevel;
using UnityEngine.UI;

namespace Advisor3D
{
    // Tokens from kit/tokens.css plus the warm theme overrides in App.css.
    public static class T
    {
        public static readonly Color tint = Ui.C("#650030"), shiraz = Ui.C("#ad112b"), highlight = Ui.C("#ff4f17"), highlightText = Ui.C("#c8380a");
        public static readonly Color onBrandMuted = Ui.C("#ffb38f"), partner = Ui.C("#008198");
        public static readonly Color label = Ui.C("#000000"), label2 = Ui.C("#5a5a5a"), gray = Ui.C("#8e8e93");
        public static readonly Color bg = Ui.C("#ffffff"), grouped = Ui.C("#f8f5f2"), grouped3 = Ui.C("#f1ece6"), edge = Ui.C("#e6dfd7"), blob = Ui.C("#efe5df");
        public static readonly Color fill3 = Ui.C(118, 118, 128, 0.12f), fill4 = Ui.C(116, 116, 128, 0.08f), separator = Ui.C(60, 60, 67, 0.18f);
        public static readonly Color rose = Ui.C("#f3e3e8"), roseSoft = Ui.C("#fbf3f5");
        public static readonly Color success = Ui.C("#008932"), warning = Ui.C("#c55300"), danger = Ui.C("#e9152d");
        public static readonly Color white = Color.white;
        public static class hue
        {
            public static readonly Color blue = Ui.C("#0088ff"), indigo = Ui.C("#6155f5"), green = Ui.C("#34c759"), orange = Ui.C("#ff8d28");
            public static readonly Color teal = Ui.C("#00c3d0"), mint = Ui.C("#00c8b3"), brown = Ui.C("#ac7f5e");
        }
    }

    public readonly struct F
    {
        public readonly int weight;
        public readonly float size;
        public F(int weight, float size) { this.weight = weight; this.size = size; }
    }

    public enum Align { Left, Center, Right }

    public static class Ui
    {
        public const float PX = 0.0015f; // meters per design px: 20px text is 3cm tall, readable at 1.7m in a Quest 3S

        public static Color C(string hex) => ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.magenta;
        public static Color C(int r, int g, int b, float a = 1) => new Color(r / 255f, g / 255f, b / 255f, a);
        public static F Font(int weight, float size) => new F(weight, size);

        public static void Kill(GameObject go)
        {
            if (!go) return;
            if (Application.isPlaying) { go.SetActive(false); UnityEngine.Object.Destroy(go); }
            else UnityEngine.Object.DestroyImmediate(go);
        }

        public static void Kill(Material m)
        {
            if (!m) return;
            if (Application.isPlaying) UnityEngine.Object.Destroy(m);
            else UnityEngine.Object.DestroyImmediate(m);
        }

        // ---------- text ----------
        static readonly Dictionary<int, TMP_FontAsset> fonts = new Dictionary<int, TMP_FontAsset>();

        // Inter stands in for the browser's system font. One dynamic SDF font per weight, built on first use.
        public static TMP_FontAsset FontAsset(int weight)
        {
            weight = weight >= 800 ? 800 : weight >= 700 ? 700 : weight >= 600 ? 600 : weight >= 500 ? 500 : 400;
            if (fonts.TryGetValue(weight, out var fa) && fa) return fa;
            var name = weight == 800 ? "Inter-ExtraBold" : weight == 700 ? "Inter-Bold" : weight == 600 ? "Inter-SemiBold" : weight == 500 ? "Inter-Medium" : "Inter-Regular";
            var font = Resources.Load<Font>("Fonts/" + name);
            fa = TMP_FontAsset.CreateFontAsset(font, 72, 8, GlyphRenderMode.SDFAA, 1024, 1024, AtlasPopulationMode.Dynamic, true);
            fa.name = name;
            fa.hideFlags = HideFlags.DontSave;
            fonts[weight] = fa;
            return fa;
        }

        public static float Measure(string text, F f, float spacing = 0)
        {
            var fa = FontAsset(f.weight);
            fa.TryAddCharacters(text);
            var scale = f.size / fa.faceInfo.pointSize;
            var w = 0f;
            foreach (var c in text)
            {
                if (fa.characterLookupTable.TryGetValue(c, out var ch)) w += ch.glyph.metrics.horizontalAdvance * scale + spacing;
            }
            return w;
        }

        public static List<string> Wrap(string text, F f, float maxW, float spacing = 0)
        {
            var lines = new List<string>();
            foreach (var para in text.Split('\n'))
            {
                var cur = "";
                foreach (var word in para.Split(' '))
                {
                    var next = cur.Length > 0 ? cur + " " + word : word;
                    if (cur.Length > 0 && Measure(next, f, spacing) > maxW) { lines.Add(cur); cur = word; }
                    else cur = next;
                }
                lines.Add(cur);
            }
            return lines;
        }

        // ---------- the guide's face, flat (for chat bubbles) ----------
        static Texture2D guideTexture;
        public static Texture2D GuideTexture()
        {
            if (guideTexture) return guideTexture;
            const int K = 8;
            const int S = Guide.N * K;
            var tex = new Texture2D(S, S, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Trilinear, hideFlags = HideFlags.DontSave };
            var px = new Color32[S * S];
            var r = S * 0.28f;
            for (var y = 0; y < S; y++)
            {
                for (var x = 0; x < S; x++)
                {
                    Color c = Guide.ColorAt(x / K, y / K);
                    // The avatar is clipped to a rounded square.
                    var cx = Mathf.Clamp(x + 0.5f, r, S - r);
                    var cy = Mathf.Clamp(y + 0.5f, r, S - r);
                    var d = Mathf.Sqrt((x + 0.5f - cx) * (x + 0.5f - cx) + (y + 0.5f - cy) * (y + 0.5f - cy));
                    c.a = Mathf.Clamp01(r - d + 0.5f);
                    px[(S - 1 - y) * S + x] = c;
                }
            }
            tex.SetPixels32(px);
            tex.Apply(true, true);
            return guideTexture = tex;
        }

        // ---------- kit components ----------
        // A static element: drawn once now, and again whenever the caller asks.
        public static El Paint(float w, float h, Action<Ctx> draw) => new El(w, h, draw).Redraw();

        public static El Card(float w, float h, Color? fill = null, float r = 24, bool shadow = true, bool edge = true)
        {
            var color = fill ?? T.bg;
            return Paint(w, h, ctx =>
            {
                if (shadow) ctx.Shadow(0, 0, w, h, r, C(60, 20, 30, 0.16f), 40, 16);
                ctx.Rect(0, 0, w, h, r, color);
                if (edge) ctx.Rect(0.5f, 0.5f, w - 1, h - 1, r, null, T.edge, 1);
            });
        }

        public static Btn Button(float w, float h, BtnO o) => new Btn(w, h, o);

        static readonly F CHIP_FONT = Font(600, 19);
        public static El Chip(string label, bool why, Action onSelect)
        {
            var w = Mathf.Ceil(Measure(label, CHIP_FONT)) + 40 + (why ? 26 : 0);
            var e = new El(w, 48, ctx =>
            {
                if (why) ctx.Rect(1, 1, w - 2, 46, 23, C("#ece8e4"));
                else ctx.Rect(1, 1, w - 2, 46, 23, T.bg, T.tint, 1.5f);
                if (why) ctx.Icon("info", 29, 24, 19, T.label, 1.8f);
                ctx.Text(label, why ? 46 : 20, 0, CHIP_FONT, why ? T.label : T.tint, lineH: 48);
            });
            e.onSelect = onSelect;
            return e.Redraw();
        }

        // One answer in the Basics form (the frontend's .qform__option).
        public static Opt Option(float w, float h, string label, bool on, Action onSelect) => new Opt(w, h, label, on, onSelect);

        public static El Row(float w, float h, RowO o)
        {
            var e = new El(w, h, ctx =>
            {
                if (o.selected) ctx.Rect(3, 3, w - 6, h - 6, 12, T.rose);
                if (!o.first && !o.selected) ctx.Fill(16, 0, w - 16, 1, T.separator);
                var trail = o.chevron || o.check != null ? 26 : 0;
                var vf = Font(o.bold ? 700 : 500, 17);
                var vw = o.value != null ? Measure(o.value, vf) : 0;
                var maxW = w - 32 - vw - trail - (o.value != null ? 14 : 0);
                var lines = Wrap(o.title, vf, maxW);
                var sub = o.subtitle != null && lines.Count == 1;
                var th = lines.Count * 21 + (sub ? 19 : 0);
                var y = (h - th) / 2f;
                y += ctx.Text(string.Join("\n", lines), 16, y, vf, lineH: 21);
                if (sub) ctx.Text(o.subtitle, 16, y, Font(400, 14), T.label2, lineH: 19);
                if (o.value != null)
                {
                    var vy = o.note != null ? (h - 38) / 2f : (h - 22) / 2f;
                    ctx.Text(o.value, w - 16 - trail, vy, vf, o.valueColor ?? T.label2, align: Align.Right, lineH: 22);
                    if (o.note != null) ctx.Text(o.note, w - 16 - trail, vy + 22, Font(400, 13), T.label2, align: Align.Right, lineH: 16);
                }
                if (o.chevron) ctx.Icon("chevron-right", w - 22, h / 2, 15, T.gray, 2.2f);
                if (o.check == true) ctx.Icon("check", w - 26, h / 2, 20, T.tint, 2.8f);
            });
            e.onSelect = o.onSelect;
            return e.Redraw();
        }

        public static El Key(float w, float h, string label, Action onSelect, string iconName = null)
        {
            var e = new El(w, h, ctx =>
            {
                ctx.Rect(0, 0, w, h, 16, iconName != null ? C("#e8e0d8") : T.grouped3);
                if (iconName != null) ctx.Icon(iconName, w / 2, h / 2, 34, T.tint, 2.4f);
                else ctx.Text(label, w / 2, 0, Font(600, 30), align: Align.Center, lineH: h);
            });
            e.onSelect = onSelect;
            return e.Redraw();
        }

        // Step the hover lift and press dip of every control. Called once per frame.
        public static void AnimateElements(float dt)
        {
            var a = Mathf.Min(1, dt * 14);
            foreach (var e in El.all)
            {
                if (e.onSelect == null) continue;
                e.lift += ((e.hover && e.enabled ? 1 : 0) - e.lift) * a;
                e.press = Mathf.Max(0, e.press - dt * 5);
                var p = e.rt.anchoredPosition3D;
                p.z = -e.lift * 0.014f / PX;
                e.rt.anchoredPosition3D = p;
                e.rt.localScale = Vector3.one * (1 + e.lift * 0.035f - e.press * 0.05f);
            }
        }
    }

    // ---------- elements ----------
    // Every element registers in El.all so pointers can find panels (for the reticle) and controls.
    public class El
    {
        public static readonly List<El> all = new List<El>();

        public readonly GameObject go;
        public readonly RectTransform rt;
        public readonly float w, h;
        public Action<Ctx> draw;
        public Action onSelect;
        public bool enabled = true, hover;
        public float lift, press;
        readonly CanvasGroup group;
        float fade = 1;

        public El(float w, float h, Action<Ctx> draw)
        {
            this.w = w;
            this.h = h;
            this.draw = draw;
            go = new GameObject("El", typeof(RectTransform), typeof(CanvasGroup));
            rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = new Vector2(0, 1);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(w, h);
            group = go.GetComponent<CanvasGroup>();
            group.blocksRaycasts = false;
            all.Add(this);
        }

        // Not drawn until asked: factories set their state first, then call Redraw().
        public El Redraw()
        {
            for (var i = rt.childCount - 1; i >= 0; i--) Ui.Kill(rt.GetChild(i).gameObject);
            draw?.Invoke(new Ctx(rt));
            return this;
        }

        public El SetEnabled(bool on) { enabled = on; group.alpha = (on ? 1 : 0.4f) * fade; return this; }
        public void SetFade(float k) { fade = k; group.alpha = (enabled ? 1 : 0.4f) * k; }
        public bool Visible { get => go.activeSelf; set => go.SetActive(value); }

        public void Dispose()
        {
            all.Remove(this);
            Ui.Kill(go);
        }
    }

    public class BtnO
    {
        public string label, variant = "filled", icon;
        public float size = 19;
        public bool iconLeft, disabled;
        public Action onSelect;
    }

    // variant: filled | bordered | plain | inverse | danger. The icon sits after the label unless iconLeft.
    public class Btn : El
    {
        public readonly BtnO o;

        public Btn(float w, float h, BtnO o) : base(w, h, null)
        {
            this.o = o;
            draw = Draw;
            onSelect = () => this.o.onSelect?.Invoke();
            Set(null);
        }

        void Draw(Ctx ctx)
        {
            var bg = o.variant == "filled" ? T.tint : o.variant == "bordered" || o.variant == "danger" ? T.fill3 : o.variant == "inverse" ? T.white : (Color?)null;
            var fg = o.variant == "filled" ? T.white : o.variant == "danger" ? T.danger : T.tint;
            if (bg != null) ctx.Rect(0, 0, w, h, h / 2, bg);
            // inverse sits straight on the room rather than on a card, so it carries its own edge
            if (o.variant == "inverse") ctx.Rect(0.75f, 0.75f, w - 1.5f, h - 1.5f, h / 2, null, T.edge, 1.5f);
            var f = Ui.Font(600, o.size);
            var iw = o.icon != null ? o.size + 8 : 0;
            var tw = Ui.Measure(o.label, f, -0.2f);
            var x0 = (w - tw - iw) / 2;
            if (o.icon != null && o.iconLeft) ctx.Icon(o.icon, x0 + o.size / 2, h / 2, o.size, fg, 2.4f);
            ctx.Text(o.label, x0 + (o.iconLeft ? iw : 0), 0, f, fg, lineH: h, spacing: -0.2f);
            if (o.icon != null && !o.iconLeft) ctx.Icon(o.icon, x0 + tw + 8 + o.size / 2, h / 2, o.size, fg, 2.6f);
        }

        public Btn Set(Action<BtnO> patch)
        {
            patch?.Invoke(o);
            SetEnabled(!o.disabled);
            Redraw();
            return this;
        }
    }

    public class Opt : El
    {
        public bool on;
        public object value;

        public Opt(float w, float h, string label, bool on, Action onSelect) : base(w, h, null)
        {
            this.on = on;
            this.onSelect = onSelect;
            draw = ctx =>
            {
                ctx.Rect(1, 1, w - 2, h - 2, 14, this.on ? T.roseSoft : T.bg, this.on ? T.tint : T.edge, this.on ? 2.5f : 1.5f);
                ctx.Text(label, 24, 0, Ui.Font(600, 21), lineH: h);
                if (this.on)
                {
                    ctx.Circle(w - 36, h / 2, 14, T.tint);
                    ctx.Icon("check", w - 36, h / 2, 17, T.white, 3);
                }
                else ctx.Circle(w - 36, h / 2, 14, null, Ui.C("#cfc6bd"), 1.5f);
            };
            Redraw();
        }
    }

    // A list row: title (+ subtitle) on the left, value (+ note) on the right. Sits on a list card.
    public class RowO
    {
        public string title, subtitle, value, note;
        public Color? valueColor;
        public bool first, chevron, selected, bold;
        public bool? check;
        public Action onSelect;
    }

    // A group of elements laid out in px from its top-left corner.
    public class Panel
    {
        public readonly float w, h;
        public readonly Transform group; // in meters; the canvas inside is scaled by PX
        public readonly Dictionary<string, List<El>> buckets = new Dictionary<string, List<El>>();
        readonly RectTransform canvas;

        public Panel(float w, float h, Transform parent, bool card = true, float r = 24)
        {
            this.w = w;
            this.h = h;
            group = new GameObject("Panel").transform;
            group.SetParent(parent, false);
            var go = new GameObject("Canvas", typeof(RectTransform), typeof(Canvas));
            canvas = (RectTransform)go.transform;
            canvas.SetParent(group, false);
            canvas.sizeDelta = new Vector2(w, h);
            canvas.localScale = Vector3.one * Ui.PX;
            var c = go.GetComponent<Canvas>();
            c.renderMode = RenderMode.WorldSpace;
            c.additionalShaderChannels = AdditionalCanvasShaderChannels.TexCoord1 | AdditionalCanvasShaderChannels.Normal | AdditionalCanvasShaderChannels.Tangent;
            c.vertexColorAlwaysGammaSpace = true;
            if (card) Add(Ui.Card(w, h, r: r), 0, 0);
        }

        // px position → local meters (for placing 3D objects on the panel). z is toward the viewer.
        public Vector3 At(float x, float y, float z = 0) => new Vector3((x - w / 2) * Ui.PX, (h / 2 - y) * Ui.PX, -z);

        public TEl Add<TEl>(TEl e, float x, float y, string bucket = "main") where TEl : El
        {
            e.rt.SetParent(canvas, false);
            e.rt.anchoredPosition3D = new Vector3(x + e.w / 2, -(y + e.h / 2), 0);
            if (!buckets.TryGetValue(bucket, out var list)) buckets[bucket] = list = new List<El>();
            list.Add(e);
            return e;
        }

        public void Clear(string bucket)
        {
            if (!buckets.TryGetValue(bucket, out var list)) return;
            foreach (var e in list) e.Dispose();
            list.Clear();
        }

        public void SetFade(float k)
        {
            foreach (var list in buckets.Values) foreach (var e in list) e.SetFade(k);
        }

        public void Dispose()
        {
            foreach (var list in buckets.Values) { foreach (var e in list) e.Dispose(); list.Clear(); }
            Ui.Kill(group.gameObject);
        }
    }

    // ---------- drawing ----------
    // What an element draws with. Coordinates are px from the element's top-left, y down, like a
    // 2D canvas. Each call adds one child (a mesh or a text) in paint order.
    public class Ctx
    {
        readonly RectTransform parent;
        readonly float ox, oy;

        public Ctx(RectTransform parent, float ox = 0, float oy = 0)
        {
            this.parent = parent;
            this.ox = ox;
            this.oy = oy;
        }

        RectTransform Node(string name, float x, float y, float w, float h, params Type[] components)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            rt.anchorMin = rt.anchorMax = rt.pivot = new Vector2(0, 1);
            rt.anchoredPosition = new Vector2(x + ox, -(y + oy));
            rt.sizeDelta = new Vector2(w, h);
            foreach (var c in components) go.AddComponent(c);
            return rt;
        }

        Shape NewShape(float x, float y, float w, float h)
        {
            var s = Node("Shape", x, y, w, h, typeof(CanvasRenderer), typeof(Shape)).GetComponent<Shape>();
            s.raycastTarget = false;
            return s;
        }

        static float[] R4(float r) => new[] { r, r, r, r };

        // A rounded rectangle. fill and stroke are both optional; the stroke is centered on the edge.
        public void Rect(float x, float y, float w, float h, float r, Color? fill, Color? stroke = null, float sw = 0) => Rect(x, y, w, h, R4(r), fill, stroke, sw);

        // radii: top-left, top-right, bottom-right, bottom-left.
        public void Rect(float x, float y, float w, float h, float[] radii, Color? fill, Color? stroke = null, float sw = 0)
        {
            if (w <= 0 || h <= 0) return;
            NewShape(x, y, w, h).RoundRect(0, 0, w, h, radii, fill, stroke, sw);
        }

        public void Fill(float x, float y, float w, float h, Color color) => Rect(x, y, w, h, 0, color);

        public void Circle(float cx, float cy, float r, Color? fill, Color? stroke = null, float sw = 0) => Rect(cx - r, cy - r, r * 2, r * 2, r, fill, stroke, sw);

        public void Shadow(float x, float y, float w, float h, float r, Color color, float blur, float offsetY) =>
            NewShape(x, y, w, h).Shadow(0, offsetY, w, h, R4(r), color, blur);

        // A vertical gradient, top color to bottom color.
        public void Gradient(float x, float y, float w, float h, Color top, Color bottom) => NewShape(x, y, w, h).Quad(0, 0, w, h, top, bottom);

        public void Face(float x, float y, float size)
        {
            var img = Node("Face", x, y, size, size, typeof(CanvasRenderer), typeof(RawImage)).GetComponent<RawImage>();
            img.texture = Ui.GuideTexture();
            img.raycastTarget = false;
        }

        // Everything drawn with the returned Ctx is cut off at this rectangle.
        public Ctx Clip(float x, float y, float w, float h)
        {
            var rt = Node("Clip", x, y, w, h, typeof(RectMask2D));
            return new Ctx(rt, -x, -y);
        }

        // Draws text with its top at y and returns the height it used. With maxW it wraps.
        // For Center, x is the middle of the text; for Right, its right edge.
        public float Text(string text, float x, float y, F f, Color? color = null, float maxW = float.PositiveInfinity, float? lineH = null, Align align = Align.Left, float spacing = 0)
        {
            var lh = lineH ?? Mathf.Round(f.size * 1.3f);
            var lines = float.IsInfinity(maxW) ? new List<string>(text.Split('\n')) : Ui.Wrap(text, f, maxW, spacing);
            var fa = Ui.FontAsset(f.weight);
            var width = 0f;
            foreach (var ln in lines) width = Mathf.Max(width, Ui.Measure(ln, f, spacing));
            width = Mathf.Ceil(width) + 8;
            var left = align == Align.Left ? x : align == Align.Center ? x - width / 2 : x - width;
            var face = fa.faceInfo;
            var scale = f.size / face.pointSize;
            var natural = face.lineHeight * scale;
            var box = (face.ascentLine - face.descentLine) * scale;

            var t = Node("Text", left, y + (lh - box) / 2, width, lines.Count * lh, typeof(CanvasRenderer), typeof(TextMeshProUGUI)).GetComponent<TextMeshProUGUI>();
            t.font = fa;
            t.fontSize = f.size;
            t.color = color ?? T.label;
            t.richText = false;
            t.raycastTarget = false;
            t.textWrappingMode = TextWrappingModes.NoWrap;
            t.overflowMode = TextOverflowModes.Overflow;
            t.alignment = align == Align.Left ? TextAlignmentOptions.TopLeft : align == Align.Center ? TextAlignmentOptions.Top : TextAlignmentOptions.TopRight;
            t.characterSpacing = spacing / f.size * 100;
            t.lineSpacing = (lh - natural) / f.size * 100;
            t.margin = Vector4.zero;
            t.text = string.Join("\n", lines);
            return lines.Count * lh;
        }

        // ---------- icons (stroked, in a size × size box centered on cx, cy) ----------
        public void Icon(string name, float cx, float cy, float size, Color color, float weight = 2)
        {
            var s = size;
            var shape = NewShape(cx - s / 2, cy - s / 2, s, s);
            var o = new Vector2(s / 2, s / 2);
            void Line(params float[] xy)
            {
                var pts = new List<Vector2>();
                for (var i = 0; i < xy.Length; i += 2) pts.Add(o + new Vector2(xy[i] * s, xy[i + 1] * s));
                shape.Polyline(pts, weight, color);
            }
            void Arc(float x, float y, float r, float a0, float a1)
            {
                var pts = new List<Vector2>();
                var n = Mathf.Max(4, Mathf.CeilToInt(Mathf.Abs(a1 - a0) / (Mathf.PI / 12)));
                for (var i = 0; i <= n; i++)
                {
                    var a = Mathf.Lerp(a0, a1, i / (float)n);
                    pts.Add(o + new Vector2(x + Mathf.Cos(a) * r, y + Mathf.Sin(a) * r) * s);
                }
                shape.Polyline(pts, weight, color);
            }
            void Ring(float r = 0.42f) => Arc(0, 0, r, 0, Mathf.PI * 2);
            void Dot(float x, float y, float r) => shape.Disc(o + new Vector2(x, y) * s, r * s, color);
            // Cubic curves through the given points: start, then (control, control, end) for each curve.
            void Curve(params float[] xy)
            {
                var pts = new List<Vector2> { o + new Vector2(xy[0], xy[1]) * s };
                for (var i = 2; i + 5 < xy.Length; i += 6)
                {
                    var p0 = pts[pts.Count - 1];
                    Vector2 p1 = o + new Vector2(xy[i], xy[i + 1]) * s, p2 = o + new Vector2(xy[i + 2], xy[i + 3]) * s, p3 = o + new Vector2(xy[i + 4], xy[i + 5]) * s;
                    for (var k = 1; k <= 10; k++)
                    {
                        var u = k / 10f;
                        var v = 1 - u;
                        pts.Add(v * v * v * p0 + 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u * p3);
                    }
                }
                shape.Polyline(pts, weight, color);
            }
            void RoundBox(float x, float y, float w, float h, float r)
            {
                var pts = new List<Vector2>();
                Shape.Outline(pts, o.x + x * s, o.y + y * s, w * s, h * s, R4(r * s), 0, 6);
                pts.Add(pts[0]);
                shape.Polyline(pts, weight, color);
            }

            switch (name)
            {
                case "chevron-right": Line(-0.16f, -0.34f, 0.18f, 0, -0.16f, 0.34f); break;
                case "chevron-left": Line(0.16f, -0.34f, -0.18f, 0, 0.16f, 0.34f); break;
                case "check": Line(-0.34f, 0.02f, -0.1f, 0.26f, 0.36f, -0.26f); break;
                case "check-circle": Ring(); Line(-0.2f, 0.02f, -0.05f, 0.17f, 0.21f, -0.14f); break;
                case "info": Ring(); Dot(0, -0.19f, 0.055f); Line(0, -0.03f, 0, 0.21f); break;
                case "exclamation": Ring(); Dot(0, 0.2f, 0.055f); Line(0, -0.22f, 0, 0.04f); break;
                case "plus": Line(-0.3f, 0, 0.3f, 0); Line(0, -0.3f, 0, 0.3f); break;
                case "minus": Line(-0.3f, 0, 0.3f, 0); break;
                case "xmark": Line(-0.28f, -0.28f, 0.28f, 0.28f); Line(0.28f, -0.28f, -0.28f, 0.28f); break;
                case "trend-up": Line(-0.4f, 0.24f, -0.1f, -0.06f, 0.08f, 0.12f, 0.4f, -0.22f); Line(0.16f, -0.22f, 0.4f, -0.22f, 0.4f, 0.02f); break;
                case "backspace":
                    Line(-0.46f, 0, -0.18f, -0.3f, 0.42f, -0.3f, 0.42f, 0.3f, -0.18f, 0.3f, -0.46f, 0);
                    Line(-0.02f, -0.12f, 0.22f, 0.12f);
                    Line(0.22f, -0.12f, -0.02f, 0.12f);
                    break;
                case "mic":
                    RoundBox(-0.15f, -0.44f, 0.3f, 0.56f, 0.15f);
                    Arc(0, 0.02f, 0.28f, 0, Mathf.PI);
                    Line(0, 0.3f, 0, 0.45f);
                    break;
                case "heart":
                    Curve(0, 0.36f, -0.62f, 0, -0.4f, -0.46f, 0, -0.16f, 0.4f, -0.46f, 0.62f, 0, 0, 0.36f);
                    break;
                case "shield":
                    Line(-0.36f, 0.02f, -0.36f, -0.3f, 0, -0.44f, 0.36f, -0.3f, 0.36f, 0.02f);
                    Curve(0.36f, 0.02f, 0.36f, 0.24f, 0.16f, 0.38f, 0, 0.45f, -0.16f, 0.38f, -0.36f, 0.24f, -0.36f, 0.02f);
                    break;
                case "people":
                    Arc(-0.1f, -0.2f, 0.15f, 0, Mathf.PI * 2);
                    Arc(-0.1f, 0.4f, 0.32f, Mathf.PI * 1.08f, Mathf.PI * 1.92f);
                    Arc(0.27f, -0.12f, 0.11f, 0, Mathf.PI * 2);
                    Arc(0.27f, 0.4f, 0.24f, Mathf.PI * 1.5f, Mathf.PI * 1.9f);
                    break;
                case "calendar":
                    RoundBox(-0.36f, -0.3f, 0.72f, 0.68f, 0.1f);
                    Line(-0.36f, -0.08f, 0.36f, -0.08f);
                    Line(-0.16f, -0.42f, -0.16f, -0.24f);
                    Line(0.16f, -0.42f, 0.16f, -0.24f);
                    break;
            }
        }
    }

    // A mesh drawn into the canvas: rounded rectangles, strokes, discs and gradients.
    // Points are px from the node's top-left, y down. Edges get a 1px feather so they stay smooth.
    public class Shape : MaskableGraphic
    {
        readonly List<Vector3> verts = new List<Vector3>();
        readonly List<Color32> colors = new List<Color32>();
        readonly List<int> tris = new List<int>();
        static readonly List<Vector2> A = new List<Vector2>(), B = new List<Vector2>();

        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            for (var i = 0; i < verts.Count; i++) vh.AddVert(verts[i], colors[i], Vector4.zero);
            for (var i = 0; i < tris.Count; i += 3) vh.AddTriangle(tris[i], tris[i + 1], tris[i + 2]);
        }

        int Vert(Vector2 p, Color c)
        {
            verts.Add(new Vector3(p.x, -p.y, 0));
            colors.Add(c);
            return verts.Count - 1;
        }

        static Color Clear(Color c) => new Color(c.r, c.g, c.b, 0);
        static int Segments(float r) => Mathf.Clamp(Mathf.CeilToInt(r / 2.5f), 4, 24);

        // The edge of a rounded rectangle grown by d (or shrunk, when d is negative), clockwise from the top-left corner.
        public static void Outline(List<Vector2> o, float x, float y, float w, float h, float[] r, float d, int seg)
        {
            o.Clear();
            d = Mathf.Max(d, -Mathf.Min(w, h) / 2);
            float x0 = x - d, y0 = y - d, x1 = x + w + d, y1 = y + h + d;
            var max = Mathf.Min(w, h) / 2;
            for (var i = 0; i < 4; i++)
            {
                var rad = Mathf.Max(0, Mathf.Min(r[i], max) + d);
                var cx = i == 0 || i == 3 ? x0 + rad : x1 - rad;
                var cy = i < 2 ? y0 + rad : y1 - rad;
                var a0 = (180 + 90 * i) * Mathf.Deg2Rad;
                for (var k = 0; k <= seg; k++)
                {
                    var a = a0 + k * (Mathf.PI / 2) / seg;
                    o.Add(new Vector2(cx + Mathf.Cos(a) * rad, cy + Mathf.Sin(a) * rad));
                }
            }
        }

        void Fan(List<Vector2> pts, Color c)
        {
            var mid = Vector2.zero;
            foreach (var p in pts) mid += p;
            var center = Vert(mid / pts.Count, c);
            var first = verts.Count;
            foreach (var p in pts) Vert(p, c);
            for (var i = 0; i < pts.Count; i++)
            {
                tris.Add(center);
                tris.Add(first + i);
                tris.Add(first + (i + 1) % pts.Count);
            }
        }

        void Band(List<Vector2> inner, Color ci, List<Vector2> outer, Color co)
        {
            var n = inner.Count;
            var a = verts.Count;
            foreach (var p in inner) Vert(p, ci);
            var b = verts.Count;
            foreach (var p in outer) Vert(p, co);
            for (var i = 0; i < n; i++)
            {
                var j = (i + 1) % n;
                tris.Add(a + i); tris.Add(b + i); tris.Add(b + j);
                tris.Add(a + i); tris.Add(b + j); tris.Add(a + j);
            }
        }

        public void RoundRect(float x, float y, float w, float h, float[] r, Color? fill, Color? stroke, float sw)
        {
            var seg = Segments(Mathf.Max(Mathf.Max(r[0], r[1]), Mathf.Max(r[2], r[3])));
            const float AA = 0.5f;
            if (fill != null)
            {
                var c = fill.Value;
                Outline(A, x, y, w, h, r, stroke != null ? 0 : -AA, seg);
                Fan(A, c);
                if (stroke == null)
                {
                    Outline(B, x, y, w, h, r, AA, seg);
                    Band(A, c, B, Clear(c));
                }
            }
            if (stroke != null && sw > 0)
            {
                var c = stroke.Value;
                var half = sw / 2;
                Outline(A, x, y, w, h, r, -half - AA, seg);
                Outline(B, x, y, w, h, r, -half + AA, seg);
                Band(A, Clear(c), B, c);
                Outline(A, x, y, w, h, r, half - AA, seg);
                Band(B, c, A, c);
                Outline(B, x, y, w, h, r, half + AA, seg);
                Band(A, c, B, Clear(c));
            }
            SetVerticesDirty();
        }

        // A soft drop shadow: solid under the shape, falling off over the blur distance.
        public void Shadow(float x, float y, float w, float h, float[] r, Color color, float blur, float unused = 0)
        {
            var seg = Segments(r[0] + blur);
            float[] steps = { -blur * 0.4f, -blur * 0.05f, blur * 0.3f, blur * 0.65f, blur };
            float[] alpha = { 1, 0.62f, 0.26f, 0.07f, 0 };
            Outline(A, x, y, w, h, r, steps[0], seg);
            Fan(A, color);
            for (var i = 1; i < steps.Length; i++)
            {
                Outline(A, x, y, w, h, r, steps[i - 1], seg);
                Outline(B, x, y, w, h, r, steps[i], seg);
                Band(A, new Color(color.r, color.g, color.b, color.a * alpha[i - 1]), B, new Color(color.r, color.g, color.b, color.a * alpha[i]));
            }
            SetVerticesDirty();
        }

        public void Quad(float x, float y, float w, float h, Color top, Color bottom)
        {
            var a = Vert(new Vector2(x, y), top);
            Vert(new Vector2(x + w, y), top);
            Vert(new Vector2(x + w, y + h), bottom);
            Vert(new Vector2(x, y + h), bottom);
            tris.Add(a); tris.Add(a + 1); tris.Add(a + 2);
            tris.Add(a); tris.Add(a + 2); tris.Add(a + 3);
            SetVerticesDirty();
        }

        public void Disc(Vector2 center, float r, Color c)
        {
            const float AA = 0.4f;
            var n = Mathf.Clamp(Mathf.CeilToInt(r * 3), 8, 32);
            A.Clear();
            B.Clear();
            for (var i = 0; i < n; i++)
            {
                var a = i * Mathf.PI * 2 / n;
                var dir = new Vector2(Mathf.Cos(a), Mathf.Sin(a));
                A.Add(center + dir * Mathf.Max(0, r - AA));
                B.Add(center + dir * (r + AA));
            }
            Fan(A, c);
            Band(A, c, B, Clear(c));
            SetVerticesDirty();
        }

        // A stroked path with round caps and joins.
        public void Polyline(List<Vector2> pts, float width, Color c)
        {
            const float AA = 0.4f;
            var half = width / 2;
            for (var i = 0; i + 1 < pts.Count; i++)
            {
                Vector2 p = pts[i], q = pts[i + 1];
                var d = q - p;
                if (d.sqrMagnitude < 1e-6f) continue;
                var n = new Vector2(-d.y, d.x).normalized;
                // feather, core, feather across the width of the stroke
                Vector2 o = n * (half + AA), m = n * Mathf.Max(0, half - AA);
                var clear = Clear(c);
                var a = Vert(p + o, clear); Vert(q + o, clear);
                Vert(p + m, c); Vert(q + m, c);
                Vert(p - m, c); Vert(q - m, c);
                Vert(p - o, clear); Vert(q - o, clear);
                for (var k = 0; k < 3; k++)
                {
                    var b = a + k * 2;
                    tris.Add(b); tris.Add(b + 1); tris.Add(b + 3);
                    tris.Add(b); tris.Add(b + 3); tris.Add(b + 2);
                }
            }
            var closed = pts.Count > 2 && (pts[0] - pts[pts.Count - 1]).sqrMagnitude < 1e-4f;
            for (var i = closed ? 1 : 0; i < pts.Count; i++) Disc(pts[i], half, c);
            SetVerticesDirty();
        }
    }
}
