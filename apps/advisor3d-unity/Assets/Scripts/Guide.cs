// Abe, the guide: the site's 32×32 pixel art of a chibi Abraham Lincoln
// (apps/web/src/guide/Avatar.tsx), drawn flat for chat bubbles (Ui.GuideTexture) and
// raised into a little relief sculpture for the room.
using System.Collections.Generic;
using UnityEngine;

namespace Advisor3D
{
    public class Guide
    {
        public const int N = 32;

        // One letter per pixel. Letters map to the colors below. Keep in sync with Avatar.tsx.
        static readonly string[] PIXELS =
        {
            "................................",
            "..........KKKKKKKKKKKK..........",
            "..........KAaaAAAAAAAK..........",
            ".........bKAaaAAAAAAAKb.........",
            "........bbKAaAAAAAAAAKbb........",
            "......bbbbKAaAAAAAAAAKbbbb......",
            "......bbbbKAaAAAAAAAAKbbbb......",
            ".....bbbbbKTttTTTTTTTKbbbbb.....",
            "....bbbbbbKTTTTTTTTTTKbbbbbb....",
            "....bbKAaaaaaAAAAAAAAAAAAKbb....",
            "...bbbbKKKKKKKKKKKKKKKKKKbbbb...",
            "...bbbbHHhssssssssssssHHHbbbb...",
            "...bbbbHHHHSSSSSSSSSSHHHHbbbb...",
            "...bbbbbhHSBBBSSSSBBBSHHbbbbb...",
            "...bbbbbzHSsssSSSSsssSHzbbbbb...",
            "...bbbbzSHSSwESSsSwESSHSzbbbb...",
            "...bbbbzSHSSEESSsSEESSHSzbbbb...",
            "...bbbbbsDDCSSSSsSSSCDDsbbbbb...",
            "...bbbbbDdDDSMSzzSSSDDDDbbbbb...",
            "...bbbbbDdDDDSnmmnSDdDDDbbbbb...",
            "....bbbbDDgDDDSSSSDDdDDDbbbb....",
            "....bbbbDDDdDDDgDDDDDDDDbbbb....",
            ".....bbbbKDdDDDgDdDgDdKbbbb.....",
            "......bbbbKDDdDDDdDDDKbbbb......",
            "......bbbbbDDdDDgDDDDbbbbb......",
            "........KKKKKDDDDDDKKKKK........",
            ".....KKKKJJYYYccccYYYJJKKKK.....",
            "...KKjjJJJJYYYYyyYYYYJJJJJKKK...",
            "..KKjjJJJJJYYLecccLYYJoJJJJJKK..",
            "..KjjJJJJJJJJLLccLLJJJOJJJJJJK..",
            "..KJJJJJJJJJJJLecLJJJJJJJJJJJK..",
            "..KJJJJJJJJJJJLccLJJJJJJJJJJJK..",
        };

        static readonly Dictionary<char, Color32> COLORS = new Dictionary<char, Color32>
        {
            ['.'] = Hex("#fde4d6"), ['b'] = Hex("#fff1e7"), ['K'] = Hex("#1c1316"), ['A'] = Hex("#2d2428"), ['a'] = Hex("#4d4146"), ['T'] = Hex("#650030"),
            ['t'] = Hex("#86193f"), ['H'] = Hex("#3a2820"), ['h'] = Hex("#52362a"), ['S'] = Hex("#f8d5bb"), ['s'] = Hex("#ecb89a"), ['z'] = Hex("#dc9f80"),
            ['B'] = Hex("#33211b"), ['E'] = Hex("#2a1410"), ['w'] = Hex("#d9d2cd"), ['C'] = Hex("#f2bfa6"), ['M'] = Hex("#9a6248"), ['m'] = Hex("#8e4a4f"),
            ['n'] = Hex("#c07a72"), ['D'] = Hex("#3a2820"), ['d'] = Hex("#5c4134"), ['g'] = Hex("#77706b"), ['J'] = Hex("#262025"), ['j'] = Hex("#3d353b"),
            ['L'] = Hex("#38303a"), ['c'] = Hex("#fff7f0"), ['e'] = Hex("#ecdccf"), ['Y'] = Hex("#141012"), ['y'] = Hex("#3a3236"), ['O'] = Hex("#ff7a47"),
            ['o'] = Hex("#ffc7a8"),
        };

        // How far each pixel stands out from the backing tile, in pixels. The face is the default.
        static readonly Dictionary<char, float> DEPTH = new Dictionary<char, float>
        {
            ['.'] = 1, ['b'] = 1.4f, ['K'] = 4.6f, ['A'] = 5.4f, ['a'] = 5.6f, ['T'] = 5.6f, ['t'] = 5.8f, ['H'] = 5, ['h'] = 5,
            ['D'] = 4.2f, ['d'] = 4.4f, ['g'] = 4.4f, ['J'] = 4, ['j'] = 4.2f, ['L'] = 4.4f, ['c'] = 3.4f, ['e'] = 3.2f,
            ['Y'] = 4.6f, ['y'] = 4.8f, ['O'] = 4.6f, ['o'] = 4.8f,
        };
        const float FACE_DEPTH = 3.2f;

        static Color32 Hex(string hex) => Ui.C(hex);
        public static Color32 ColorAt(int x, int y) => COLORS[PIXELS[y][x]];

        // The avatar is clipped to a rounded square (the frontend uses clip-path: inset(0 round 28%)).
        static bool Inside(int x, int y)
        {
            var r = N * 0.28f;
            var cx = Mathf.Clamp(x + 0.5f, r, N - r);
            var cy = Mathf.Clamp(y + 0.5f, r, N - r);
            return Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(cx, cy)) <= r;
        }

        public readonly Transform group;
        readonly Mesh mesh;
        readonly Color32[] colors;
        readonly List<(int start, int count, Color32 open)> eyes = new List<(int, int, Color32)>();
        // The four pixels of chin under Abe's lips. They darken as his mouth opens: the middle two
        // first, then all four.
        readonly List<(int start, int count, bool middle)> jaw = new List<(int, int, bool)>();
        const int JAW_ROW = 20, JAW_FROM = 14, JAW_TO = 17;
        static readonly Color32 MOUTH = Ui.C("#4a1f24");
        bool shut;
        int open; // 0 closed, 1 half open, 2 open
        float sinceMouth;
        float pulse = 1;

        public Guide(float size, Transform parent)
        {
            var u = size / N;
            var b = new MeshGen();
            for (var y = 0; y < N; y++)
            {
                for (var x = 0; x < N; x++)
                {
                    if (!Inside(x, y)) continue;
                    var ch = PIXELS[y][x];
                    var depth = (DEPTH.TryGetValue(ch, out var d) ? d : FACE_DEPTH) * u;
                    var start = b.Count;
                    // Each pixel is a box standing out toward the viewer (local −Z).
                    b.Box(new Vector3((x - N / 2f + 0.5f) * u, (N / 2f - y - 0.5f) * u, -depth / 2), new Vector3(u, u, depth), COLORS[ch], back: false);
                    if ("Ew".IndexOf(ch) >= 0) eyes.Add((start, b.Count - start, COLORS[ch]));
                    if (y == JAW_ROW && x >= JAW_FROM && x <= JAW_TO) jaw.Add((start, b.Count - start, x > JAW_FROM && x < JAW_TO));
                }
            }
            mesh = b.ToMesh("Guide");
            mesh.MarkDynamic();
            colors = mesh.colors32;

            var go = new GameObject("Guide", typeof(MeshFilter), typeof(MeshRenderer));
            group = go.transform;
            group.SetParent(parent, false);
            go.GetComponent<MeshFilter>().sharedMesh = mesh;
            go.GetComponent<MeshRenderer>().sharedMaterial = Mat.Lit(Color.white);
        }

        // mood: "idle" | "typing" | "listening" | "speaking"; level (0..1) is how loud the guide is speaking.
        public void Tick(float t, string mood, float level)
        {
            var typing = mood == "typing";
            var speaking = mood == "speaking";
            group.localPosition = new Vector3(0, Mathf.Sin(t * (typing ? 5 : speaking ? 3.2f : 1.4f)) * (typing ? 0.006f : speaking ? 0.012f : 0.008f), 0);
            var yaw = Mathf.Sin(t * 0.6f) * (speaking ? 0.08f : 0.16f);
            var pitch = typing ? Mathf.Sin(t * 5) * 0.05f
                : speaking ? Mathf.Sin(t * 6) * 0.04f * (0.3f + level)
                : mood == "listening" ? 0.07f : Mathf.Sin(t * 0.45f) * 0.03f;
            // The WebXR room is right-handed, so its rotations change sign here.
            group.localRotation = Quaternion.Euler(-pitch * Mathf.Rad2Deg, -yaw * Mathf.Rad2Deg, 0);
            // Swell with the voice while speaking, ease back otherwise.
            pulse += (1 + (speaking ? level * 0.1f : 0) - pulse) * 0.35f;
            group.localScale = Vector3.one * pulse;
            var changed = false;
            // A short blink every few seconds.
            var blink = t % 4.2f < 0.13f;
            if (blink != shut)
            {
                shut = blink;
                foreach (var (start, count, color) in eyes)
                {
                    var c = shut ? COLORS['s'] : color;
                    for (var i = 0; i < count; i++) colors[start + i] = c;
                }
                changed = true;
            }
            // His mouth opens and closes with his voice: wider when louder, and never held in one
            // shape for long, so it keeps moving through a sentence.
            sinceMouth += Time.deltaTime;
            var want = !speaking || level < 0.06f ? 0 : level > 0.45f ? 2 : 1;
            if (speaking && want == open && want > 0 && sinceMouth > 0.16f) want = open == 2 ? 1 : level > 0.25f ? 2 : 0;
            if (want != open && (sinceMouth > 0.07f || want == 0))
            {
                open = want;
                sinceMouth = 0;
                foreach (var (start, count, middle) in jaw)
                {
                    var c = open == 2 || (open == 1 && middle) ? MOUTH : COLORS['S'];
                    for (var i = 0; i < count; i++) colors[start + i] = c;
                }
                changed = true;
            }
            if (changed) mesh.colors32 = colors;
        }
    }
}
