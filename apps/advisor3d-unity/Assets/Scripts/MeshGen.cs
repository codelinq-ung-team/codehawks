// The few 3D shapes the room needs, built in code so the project carries no model files.
// Also Mat, which makes the materials for the three Advisor shaders.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Advisor3D
{
    public class MeshGen
    {
        readonly List<Vector3> verts = new List<Vector3>(), normals = new List<Vector3>();
        readonly List<Color32> colors = new List<Color32>();
        readonly List<int> tris = new List<int>();

        public int Count => verts.Count;

        int Vert(Vector3 p, Vector3 n, Color32 c)
        {
            verts.Add(p);
            normals.Add(n);
            colors.Add(c);
            return verts.Count - 1;
        }

        // Two triangles for a b c d (in order around the quad), wound so the front faces along n.
        void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 n, Color32 col)
        {
            var i = Vert(a, n, col);
            Vert(b, n, col);
            Vert(c, n, col);
            Vert(d, n, col);
            Wind(i, i + 1, i + 2, n);
            Wind(i, i + 2, i + 3, n);
        }

        void Wind(int a, int b, int c, Vector3 n)
        {
            var front = Vector3.Dot(Vector3.Cross(verts[b] - verts[a], verts[c] - verts[a]), n) >= 0;
            tris.Add(a);
            tris.Add(front ? b : c);
            tris.Add(front ? c : b);
        }

        public void Box(Vector3 center, Vector3 size, Color32 col, bool back = true)
        {
            var h = size / 2;
            Vector3 P(float x, float y, float z) => center + new Vector3(x * h.x, y * h.y, z * h.z);
            Quad(P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), Vector3.back, col);
            if (back) Quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), Vector3.forward, col);
            Quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), Vector3.left, col);
            Quad(P(1, -1, -1), P(1, -1, 1), P(1, 1, 1), P(1, 1, -1), Vector3.right, col);
            Quad(P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1), Vector3.up, col);
            Quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), Vector3.down, col);
        }

        // A surface from a grid of points; normals come from the function too.
        void Grid(int nu, int nv, System.Func<float, float, (Vector3 p, Vector3 n)> f)
        {
            var first = verts.Count;
            for (var j = 0; j <= nv; j++)
            {
                for (var i = 0; i <= nu; i++)
                {
                    var (p, n) = f(i / (float)nu, j / (float)nv);
                    Vert(p, n, Color.white);
                }
            }
            for (var j = 0; j < nv; j++)
            {
                for (var i = 0; i < nu; i++)
                {
                    int a = first + j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
                    var n = normals[a] + normals[b] + normals[c] + normals[d];
                    // Where one edge of the cell shrinks to a point (a pole, a disc's center), one triangle is enough.
                    if ((verts[b] - verts[a]).sqrMagnitude > 1e-12f) Wind(a, b, c, n);
                    if ((verts[c] - verts[d]).sqrMagnitude > 1e-12f) Wind(a, c, d, n);
                }
            }
        }

        public Mesh ToMesh(string name)
        {
            var m = new Mesh { name = name, hideFlags = HideFlags.DontSave };
            if (verts.Count > 65000) m.indexFormat = IndexFormat.UInt32;
            m.SetVertices(verts);
            m.SetNormals(normals);
            m.SetColors(colors);
            m.SetTriangles(tris, 0);
            m.RecalculateBounds();
            return m;
        }

        // ---------- ready-made shapes ----------
        static Mesh unitBox, beam, sphere, mote;

        public static Mesh UnitBox()
        {
            if (unitBox) return unitBox;
            var b = new MeshGen();
            b.Box(Vector3.zero, Vector3.one, Color.white);
            return unitBox = b.ToMesh("Box");
        }

        // A box one unit long that starts at the origin and runs along +Z (for pointer rays).
        public static Mesh Beam()
        {
            if (beam) return beam;
            var b = new MeshGen();
            b.Box(new Vector3(0, 0, 0.5f), Vector3.one, Color.white);
            return beam = b.ToMesh("Beam");
        }

        public static Mesh Sphere()
        {
            if (sphere) return sphere;
            var b = new MeshGen();
            b.Grid(32, 16, (u, v) =>
            {
                float a = u * Mathf.PI * 2, e = (v - 0.5f) * Mathf.PI;
                var n = new Vector3(Mathf.Cos(e) * Mathf.Cos(a), Mathf.Sin(e), Mathf.Cos(e) * Mathf.Sin(a));
                return (n, n);
            });
            return sphere = b.ToMesh("Sphere");
        }

        // A tiny eight-sided gem, for the motes of light.
        public static Mesh Mote()
        {
            if (mote) return mote;
            var b = new MeshGen();
            b.Grid(4, 2, (u, v) =>
            {
                float a = u * Mathf.PI * 2, e = (v - 0.5f) * Mathf.PI;
                var n = new Vector3(Mathf.Cos(e) * Mathf.Cos(a), Mathf.Sin(e), Mathf.Cos(e) * Mathf.Sin(a));
                return (n, n);
            });
            return mote = b.ToMesh("Mote");
        }

        // A flat ring lying on the floor, facing up. inner = 0 makes a disc.
        public static Mesh Ring(float inner, float outer, int segments = 96)
        {
            var b = new MeshGen();
            b.Grid(segments, 1, (u, v) =>
            {
                var a = u * Mathf.PI * 2;
                var r = Mathf.Lerp(inner, outer, v);
                return (new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r), Vector3.up);
            });
            return b.ToMesh("Ring");
        }

        // A flat ring facing −Z (toward whoever looks along +Z), for the reticle.
        public static Mesh FacingRing(float inner, float outer, int segments = 24)
        {
            var b = new MeshGen();
            b.Grid(segments, 1, (u, v) =>
            {
                var a = u * Mathf.PI * 2;
                var r = Mathf.Lerp(inner, outer, v);
                return (new Vector3(Mathf.Cos(a) * r, Mathf.Sin(a) * r, 0), Vector3.back);
            });
            return b.ToMesh("FacingRing");
        }

        // A ring-shaped tube. upright: standing in the XY plane (like an arch); otherwise lying flat in XZ.
        public static Mesh Torus(float radius, float tube, bool upright, int around = 96, int across = 12)
        {
            var b = new MeshGen();
            b.Grid(around, across, (u, v) =>
            {
                float a = u * Mathf.PI * 2, t = v * Mathf.PI * 2;
                var ring = upright ? new Vector3(Mathf.Cos(a), Mathf.Sin(a), 0) : new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a));
                var axis = upright ? Vector3.forward : Vector3.up;
                var n = ring * Mathf.Cos(t) + axis * Mathf.Sin(t);
                return (ring * radius + n * tube, n);
            });
            return b.ToMesh("Torus");
        }

        // A cylinder along Y, centered on the origin, with flat ends.
        public static Mesh Cylinder(float radius, float height, int segments = 64)
        {
            var b = new MeshGen();
            b.Grid(segments, 1, (u, v) =>
            {
                var a = u * Mathf.PI * 2;
                var n = new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a));
                return (n * radius + Vector3.up * (v - 0.5f) * height, n);
            });
            foreach (var up in new[] { 1f, -1f })
            {
                b.Grid(segments, 1, (u, v) =>
                {
                    var a = u * Mathf.PI * 2;
                    return (new Vector3(Mathf.Cos(a) * radius * v, up * height / 2, Mathf.Sin(a) * radius * v), Vector3.up * up);
                });
            }
            return b.ToMesh("Cylinder");
        }
    }

    public static class Mat
    {
        static Material Make(string shader, Color color, bool transparent)
        {
            var m = new Material(Shader.Find(shader)) { hideFlags = HideFlags.DontSave };
            m.SetColor("_Color", color);
            if (transparent)
            {
                m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
                m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
                m.SetFloat("_ZWrite", 0);
                m.renderQueue = (int)RenderQueue.Transparent;
            }
            return m;
        }

        public static Material Unlit(Color color, bool transparent = false, bool onTop = false, bool twoSided = false)
        {
            var m = Make("Advisor/Unlit", color, transparent || color.a < 1);
            if (twoSided) m.SetFloat("_Cull", (float)CullMode.Off);
            if (onTop)
            {
                m.SetFloat("_ZTest", (float)CompareFunction.Always);
                m.renderQueue = (int)RenderQueue.Overlay;
            }
            return m;
        }

        public static Material Lit(Color color, bool transparent = false) => Make("Advisor/Lit", color, transparent);

        public static Material Sky(Color low, Color high)
        {
            var m = new Material(Shader.Find("Advisor/Sky")) { hideFlags = HideFlags.DontSave };
            m.SetColor("_Low", low);
            m.SetColor("_High", high);
            return m;
        }

        // A mesh in the scene, in one line.
        public static Transform Spawn(string name, Mesh mesh, Material material, Transform parent)
        {
            var go = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            go.transform.SetParent(parent, false);
            go.GetComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.GetComponent<MeshRenderer>();
            r.sharedMaterial = material;
            r.shadowCastingMode = ShadowCastingMode.Off;
            r.receiveShadows = false;
            return go.transform;
        }
    }
}
