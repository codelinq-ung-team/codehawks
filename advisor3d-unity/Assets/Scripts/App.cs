// The room, the camera, and the pointers (controllers, hands, or a mouse in the editor).
// The look follows the 2D frontend: warm beige, white cards, burgundy and one orange arc.
// A port of advisor3d/src/xr/world.js. The WebXR room is right-handed with −Z ahead;
// Unity has +Z ahead, so every z from the web code is negated here.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.XR;
using UnityEngine.XR;
using UnityEngine.XR.ARFoundation;

namespace Advisor3D
{
    public class App : MonoBehaviour
    {
        public const float EYE = 1.5f; // the height the layout is designed around, in meters
        public static readonly Vector3 FOCUS = new Vector3(0, 1.38f, 1.7f); // center of the main panel

        public static App I { get; private set; }
        public static Transform rig; // panels hang off the rig; in a headset it moves to the wearer
        public static Camera cam;
        public static bool Passthrough { get; private set; }

        GameObject environment;
        ARCameraManager arCamera;
        AudioSource audioSource;
        readonly Dictionary<int, AudioClip> blips = new Dictionary<int, AudioClip>();

        Transform[] motes;
        Vector3[] moteBase;

        readonly List<Pointer> pointers = new List<Pointer>();
        readonly Pointer mousePointer = new Pointer();
        float desktopZ = 0.75f;
        int settle; // frames to wait before reading where the wearer is
        bool wasXR;
        bool placed, snap, gliding;
        Vector3 goal;
        Quaternion goalFacing = Quaternion.identity;
        float astray; // seconds the wearer has been turned or walked away from the panels
        InputAction[] recenterButtons;
        float held; // seconds a recenter button has been down
        bool heldFired;
        DateTime pausedAt;

        const float AWAY_SECONDS = 0.8f;   // looking away this long brings the panels back in front
        const float AWAY_ANGLE = 55;       // degrees off the main panel; the side panels end at about 45
        const float AWAY_STEP = 0.5f;      // meters walked, or stood up or sat down, from where the panels were placed
        const float HOLD_SECONDS = 1.5f;   // holding B or Y this long starts over
        const double NEW_PERSON_SECONDS = 10; // headset off this long means the next person gets a fresh start

        static readonly List<XRDisplaySubsystem> displays = new List<XRDisplaySubsystem>();
        static readonly List<XRInputSubsystem> inputs = new List<XRInputSubsystem>();
        readonly HashSet<XRInputSubsystem> floored = new HashSet<XRInputSubsystem>();

        void Awake() => Build();

        // Bring every panel back in front of the wearer, at their eye height.
        public static void Recenter()
        {
            if (I) I.settle = 1;
        }

        // Back to a clean Home screen, in front of whoever is wearing the headset now.
        public static void StartOver()
        {
            Store.Reset();
            Store.Go("home");
            if (I) I.snap = true;
            Recenter();
        }

        // Taking the headset off pauses the app. Putting it back on recenters; after a longer break it
        // is probably someone new, so they start from Home.
        void OnApplicationPause(bool paused)
        {
            // The headset is off: hang up so the microphone and the voice session are not left open.
            if (paused) { pausedAt = DateTime.UtcNow; if (Voice.On) Voice.Stop(); return; }
            if (pausedAt == default) return;
            if ((DateTime.UtcNow - pausedAt).TotalSeconds >= NEW_PERSON_SECONDS) StartOver();
            else settle = 20;
            snap = true;
        }

        void OnDestroy()
        {
            Voice.Stop();
            if (recenterButtons != null) foreach (var a in recenterButtons) { a.Disable(); a.Dispose(); }
            foreach (var p in pointers) p.Dispose();
        }

        // Builds everything in code. Also called by the editor to take screenshots without entering play mode.
        public void Build()
        {
            I = this;
            El.all.Clear();
            Store.Restart();

            rig = new GameObject("Rig").transform;
            rig.SetParent(transform, false);

            BuildCamera();
            BuildRoom();
            if (Application.isPlaying) BuildPointers();

            audioSource = gameObject.AddComponent<AudioSource>();
            audioSource.playOnAwake = false;
            audioSource.spatialBlend = 0;

            Screens.Start();
        }

        // ---------- camera ----------
        void BuildCamera()
        {
            var go = new GameObject("Camera") { tag = "MainCamera" };
            go.transform.SetParent(transform, false);
            cam = go.AddComponent<Camera>();
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = 90;
            cam.fieldOfView = 50;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = T.grouped;
            cam.allowHDR = false;
            go.AddComponent<AudioListener>();
            go.transform.localPosition = new Vector3(0, EYE - 0.08f, -desktopZ);
            go.transform.LookAt(FOCUS);
            if (!Application.isPlaying) return;

            // The headset drives the camera. Without a headset nothing is bound and the desktop view below applies.
            var position = new InputAction("Head Position", InputActionType.Value, "<XRHMD>/centerEyePosition");
            var rotation = new InputAction("Head Rotation", InputActionType.Value, "<XRHMD>/centerEyeRotation");
            var driver = go.AddComponent<TrackedPoseDriver>();
            driver.ignoreTrackingState = true;
            driver.positionInput = new InputActionProperty(position);
            driver.rotationInput = new InputActionProperty(rotation);
            position.Enable();
            rotation.Enable();

            // Passthrough needs an AR session and a camera manager; they only do something on the headset.
            if (Application.isMobilePlatform)
            {
                new GameObject("AR Session").AddComponent<ARSession>().transform.SetParent(transform, false);
                arCamera = go.AddComponent<ARCameraManager>();
                arCamera.enabled = false;
            }
        }

        // The room is drawn in VR and hidden in passthrough, where the real room shows instead.
        public static void SetPassthrough(bool on)
        {
            Passthrough = on;
            I.environment.SetActive(!on);
            cam.backgroundColor = on ? new Color(0, 0, 0, 0) : T.grouped;
            if (I.arCamera) I.arCamera.enabled = on;
        }

        // ---------- room ----------
        void BuildRoom()
        {
            environment = new GameObject("Environment");
            var env = environment.transform;
            env.SetParent(transform, false);
            var FLOOR = Ui.C("#efe7df");

            var sky = Mat.Spawn("Sky", MeshGen.Sphere(), Mat.Sky(FLOOR, Ui.C("#fcfaf8")), env);
            sky.localScale = Vector3.one * 60;

            Mat.Spawn("Floor", MeshGen.Ring(0, 60, 64), Mat.Unlit(FLOOR, twoSided: true), env);
            void Ring(float inner, float outer, Color color, float opacity, float y)
            {
                color.a = opacity;
                Mat.Spawn("Ring", MeshGen.Ring(inner, outer), Mat.Unlit(color, twoSided: true), env).localPosition = new Vector3(0, y, 0);
            }
            Ring(0, 2.3f, Ui.C("#f8f5f2"), 1, 0.004f);
            Ring(2.3f, 2.34f, T.tint, 0.22f, 0.005f);
            // The WebXR room also had a bright orange ring on the floor at 3.3 m. Seen from a headset it ran
            // straight behind the footer and the lower panels, so it is left out here.

            // Soft hills on the horizon, and the brand's arcs rising out of the floor.
            (float x, float z, float r, string color)[] hills =
            {
                (-13, -15, 7, "#e6d9cf"), (10, -19, 9, "#e9ded5"), (-2, -24, 8, "#ebe1d9"), (19, -6, 6, "#e6d9cf"),
                (-20, 2, 8, "#e9ded5"), (3, 21, 9, "#e6d9cf"), (-12, 16, 6, "#ebe1d9"),
            };
            foreach (var (x, z, r, color) in hills)
            {
                var m = Mat.Spawn("Hill", MeshGen.Sphere(), Mat.Unlit(Ui.C(color)), env);
                m.localScale = new Vector3(r, r * 0.5f, r);
                m.localPosition = new Vector3(x, -r * 0.14f, -z);
            }
            (float x, float z, float r, float tube, Color color, float yaw)[] arcs =
            {
                (9.5f, -10, 3.6f, 0.11f, T.highlight, 0.7f), (-11, -9, 4.4f, 0.13f, T.tint, -0.7f),
                (10, 7, 3, 0.09f, T.tint, 1.9f), (-9, 8, 2.6f, 0.09f, T.highlight, -2.2f),
            };
            foreach (var (x, z, r, tube, color, yaw) in arcs)
            {
                var m = Mat.Spawn("Arc", MeshGen.Torus(r, tube, upright: true), Mat.Unlit(color), env);
                m.localPosition = new Vector3(x, -r * 0.25f, -z);
                m.localRotation = Quaternion.Euler(0, -yaw * Mathf.Rad2Deg, 0);
            }

            // Slow motes of warm light, so the air has depth. Hidden with the room in passthrough.
            const int MOTES = 70;
            motes = new Transform[MOTES];
            moteBase = new Vector3[MOTES];
            var moteMaterial = Mat.Unlit(new Color(T.onBrandMuted.r, T.onBrandMuted.g, T.onBrandMuted.b, 0.8f));
            long s = 11;
            float Rnd() => (s = s * 16807 % 2147483647) / 2147483647f;
            for (var i = 0; i < MOTES; i++)
            {
                var a = Rnd() * Mathf.PI * 2;
                var r = 2.4f + Rnd() * 5;
                moteBase[i] = new Vector3(Mathf.Sin(a) * r, 0.3f + Rnd() * 3.2f, Mathf.Cos(a) * r);
                motes[i] = Mat.Spawn("Mote", MeshGen.Mote(), moteMaterial, env);
                motes[i].localScale = Vector3.one * 0.016f;
                motes[i].localPosition = moteBase[i];
            }
        }

        // ---------- sound (tiny synthesized cues, no assets) ----------
        public static void Blip(float freq = 660, float dur = 0.09f, float vol = 0.04f)
        {
            if (!I || !I.audioSource || !Application.isPlaying) return;
            var key = (int)freq * 1000 + (int)(dur * 1000);
            if (!I.blips.TryGetValue(key, out var clip))
            {
                const int RATE = 44100;
                var n = Mathf.CeilToInt(RATE * dur);
                var data = new float[n];
                // A sine that dies away, like the WebXR version's gain ramp.
                for (var i = 0; i < n; i++) data[i] = Mathf.Sin(2 * Mathf.PI * freq * i / RATE) * Mathf.Pow(0.0001f, i / (float)n);
                clip = AudioClip.Create("blip", n, 1, RATE, false);
                clip.SetData(data, 0);
                I.blips[key] = clip;
            }
            // Web Audio gains are much quieter than Unity volumes at the same number.
            I.audioSource.PlayOneShot(clip, Mathf.Clamp01(vol * 6));
        }

        // ---------- pointers ----------
        class Pointer
        {
            public El hovered;
            public float? distance;
            public bool connected;
            public Ray ray;
            public Transform line, dot;
            // A controller's aim pose and trigger, and a tracked hand's aim pose and pinch.
            public InputAction aimPosition, aimRotation, gripPosition, gripRotation, tracked, trigger;
            public InputAction handPosition, handRotation, handTracked, pinch;

            InputAction[] All => new[] { aimPosition, aimRotation, gripPosition, gripRotation, tracked, trigger, handPosition, handRotation, handTracked, pinch };
            public void Enable() { foreach (var a in All) a.Enable(); }
            public void Dispose() { foreach (var a in All) { a?.Disable(); a?.Dispose(); } }

            // Where this hand is pointing right now, and whether it just selected.
            public bool Read(out bool pressed)
            {
                pressed = false;
                if (tracked.controls.Count > 0 && tracked.ReadValue<float>() > 0.5f)
                {
                    var aim = aimPosition.controls.Count > 0;
                    var position = (aim ? aimPosition : gripPosition).ReadValue<Vector3>();
                    var rotation = (aim ? aimRotation : gripRotation).ReadValue<Quaternion>();
                    ray = new Ray(position, rotation * Vector3.forward);
                    pressed = trigger.WasPressedThisFrame();
                    return true;
                }
                if (handTracked.controls.Count > 0 && handTracked.ReadValue<float>() > 0.5f)
                {
                    ray = new Ray(handPosition.ReadValue<Vector3>(), handRotation.ReadValue<Quaternion>() * Vector3.forward);
                    pressed = pinch.WasPressedThisFrame();
                    return true;
                }
                return false;
            }
        }

        void BuildPointers()
        {
            // B on the right controller, Y on the left: tap to recenter, hold to start over.
            recenterButtons = new[]
            {
                new InputAction(type: InputActionType.Button, binding: "<XRController>{LeftHand}/{SecondaryButton}"),
                new InputAction(type: InputActionType.Button, binding: "<XRController>{RightHand}/{SecondaryButton}"),
            };
            foreach (var a in recenterButtons) a.Enable();

            foreach (var hand in new[] { "LeftHand", "RightHand" })
            {
                static InputAction Value(string path) => new InputAction(type: InputActionType.Value, binding: path);
                static InputAction Button(string path) => new InputAction(type: InputActionType.Button, binding: path);
                var c = $"<XRController>{{{hand}}}/";
                var h = $"<MetaAimHand>{{{hand}}}/";
                var p = new Pointer
                {
                    aimPosition = Value(c + "pointerPosition"), aimRotation = Value(c + "pointerRotation"),
                    gripPosition = Value(c + "devicePosition"), gripRotation = Value(c + "deviceRotation"),
                    tracked = Value(c + "isTracked"), trigger = Button(c + "{TriggerButton}"),
                    handPosition = Value(h + "devicePosition"), handRotation = Value(h + "deviceRotation"),
                    handTracked = Value(h + "isTracked"), pinch = Button(h + "indexPressed"),
                };
                p.Enable();

                p.line = Mat.Spawn("Ray", MeshGen.Beam(), Mat.Unlit(new Color(T.tint.r, T.tint.g, T.tint.b, 0.55f)), transform);
                p.dot = Mat.Spawn("Reticle", MeshGen.FacingRing(0, 0.008f), Mat.Unlit(T.highlight, transparent: true, onTop: true, twoSided: true), transform);
                Mat.Spawn("Edge", MeshGen.FacingRing(0.008f, 0.011f), Mat.Unlit(Color.white, transparent: true, onTop: true, twoSided: true), p.dot);
                p.line.gameObject.SetActive(false);
                p.dot.gameObject.SetActive(false);
                pointers.Add(p);
            }
        }

        // Nearest control under the ray, plus the distance to whatever surface the ray lands on.
        static void Pick(Pointer p)
        {
            El target = null;
            float? surface = null, hit = null;
            foreach (var e in El.all)
            {
                if (!e.go.activeInHierarchy) continue;
                var t = e.rt;
                var denom = Vector3.Dot(p.ray.direction, t.forward);
                if (Mathf.Abs(denom) < 1e-5f) continue;
                var d = Vector3.Dot(t.position - p.ray.origin, t.forward) / denom;
                if (d <= 0) continue;
                var local = t.InverseTransformPoint(p.ray.GetPoint(d));
                if (Mathf.Abs(local.x) > e.w / 2 || Mathf.Abs(local.y) > e.h / 2) continue;
                if (surface == null || d < surface) surface = d;
                // Controls lift toward you on hover, so among overlapping ones the later (upper) one wins a tie.
                if (e.onSelect != null && e.enabled && (hit == null || d <= hit + 0.02f)) { target = e; hit = d; }
            }
            if (target != p.hovered)
            {
                p.hovered = target;
                if (target != null) Blip(880, 0.03f, 0.012f);
            }
            p.distance = hit ?? surface;
        }

        static void Select(Pointer p)
        {
            Pick(p);
            var e = p.hovered;
            if (e == null) return;
            e.press = 1;
            Blip(520, 0.1f, 0.04f);
            e.onSelect();
        }

        // ---------- loop ----------
        static bool XRActive()
        {
            SubsystemManager.GetSubsystems(displays);
            foreach (var d in displays) if (d.running) return true;
            return false;
        }

        // Use the floor as the origin so the layout lands at the same height seated or standing.
        void UseFloorOrigin()
        {
            SubsystemManager.GetSubsystems(inputs);
            foreach (var input in inputs)
            {
                if (floored.Contains(input)) continue;
                // Keep asking until the headset agrees; it can refuse in the first frames.
                if (input.GetTrackingOriginMode() != TrackingOriginModeFlags.Floor && !input.TrySetTrackingOriginMode(TrackingOriginModeFlags.Floor)) continue;
                floored.Add(input);
                input.trackingOriginUpdated += _ => settle = 20;
                settle = 20;
            }
        }

        // The ways to get the panels back: tap B or Y, or just turn or walk away from them for a moment.
        // Holding B or Y starts over.
        void Reorient(float dt)
        {
            var down = false;
            var released = false;
            foreach (var a in recenterButtons) { down |= a.IsPressed(); released |= a.WasReleasedThisFrame(); }
            if (down)
            {
                held += dt;
                if (held >= HOLD_SECONDS && !heldFired) { heldFired = true; Blip(440, 0.18f, 0.05f); StartOver(); }
            }
            else
            {
                if (released && !heldFired) { Blip(700, 0.08f, 0.04f); Recenter(); }
                held = 0;
                heldFired = false;
            }

            if (settle > 0 || gliding) { astray = 0; return; }
            var head = cam.transform;
            var toPanels = Vector3.ProjectOnPlane(rig.forward, Vector3.up);
            var looking = Vector3.ProjectOnPlane(head.forward, Vector3.up);
            // How far the wearer has moved from the spot the layout was built around, sitting or standing included.
            var moved = head.position - (rig.position + Vector3.up * EYE);
            var away = (looking.sqrMagnitude > 0.01f && Vector3.Angle(looking, toPanels) > AWAY_ANGLE) || moved.magnitude > AWAY_STEP;
            astray = away ? astray + dt : 0;
            if (astray >= AWAY_SECONDS) { astray = 0; Recenter(); }
        }

        void Update()
        {
            var dt = Mathf.Min(Time.deltaTime, 0.05f);
            var t = Time.time;
            var xr = XRActive();

            if (xr)
            {
                UseFloorOrigin();
                if (!wasXR) settle = 20;
                Reorient(dt);
                if (settle > 0 && --settle == 0)
                {
                    // Put the panels in front of the wearer, wherever they stand and whichever way they face.
                    // With a floor origin, head.y is the real eye height. Without one it is near zero.
                    var head = cam.transform.position;
                    var forward = Vector3.ProjectOnPlane(cam.transform.forward, Vector3.up);
                    goal = new Vector3(head.x, Mathf.Clamp(head.y - EYE, -EYE, 0.4f), head.z);
                    if (forward.sqrMagnitude > 0.01f) goalFacing = Quaternion.LookRotation(forward);
                    gliding = true;
                    if (!placed || snap)
                    {
                        // First placement, or a fresh start: jump there, and bring the room along. When the
                        // headset reports no floor (head.y near zero), the floor goes where the layout assumes
                        // it is, EYE below the eyes. On a plain recenter the room stays put; only the panels move.
                        rig.SetPositionAndRotation(goal, goalFacing);
                        var floor = head.y > 0.5f ? 0 : head.y - EYE;
                        environment.transform.SetPositionAndRotation(new Vector3(head.x, floor, head.z), goalFacing);
                        placed = true;
                        snap = false;
                    }
                    Debug.Log($"Advisor3D: placed the panels for eye height {head.y:0.00} m.");
                }
                if (gliding)
                {
                    // Panels glide to their new place rather than jumping.
                    var k = 1 - Mathf.Exp(-7 * dt);
                    rig.SetPositionAndRotation(Vector3.Lerp(rig.position, goal, k), Quaternion.Slerp(rig.rotation, goalFacing, k));
                    if ((rig.position - goal).sqrMagnitude < 1e-6f && Quaternion.Angle(rig.rotation, goalFacing) < 0.1f)
                    {
                        rig.SetPositionAndRotation(goal, goalFacing);
                        gliding = false;
                    }
                }
            }
            else
            {
                if (wasXR)
                {
                    rig.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
                    environment.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
                }
                // Pull back until the three panels fit the window, whatever its shape.
                var half = Mathf.Tan(cam.fieldOfView * Mathf.Deg2Rad / 2);
                desktopZ = Mathf.Max(0.75f, 1.3f / (cam.aspect * half) - 1.27f);
                var mouse = Mouse.current != null ? Mouse.current.position.ReadValue() : new Vector2(Screen.width / 2f, Screen.height / 2f);
                var mx = Mathf.Clamp(mouse.x / Screen.width * 2 - 1, -1, 1);
                var my = Mathf.Clamp(mouse.y / Screen.height * 2 - 1, -1, 1);
                var to = new Vector3(mx * 0.1f, EYE - 0.08f + my * 0.05f, -desktopZ);
                cam.transform.position = Vector3.Lerp(cam.transform.position, to, Mathf.Min(1, dt * 4));
                cam.transform.LookAt(FOCUS);
            }
            wasXR = xr;

            foreach (var e in El.all) e.hover = false;
            if (xr)
            {
                foreach (var p in pointers)
                {
                    p.connected = p.Read(out var pressed);
                    p.line.gameObject.SetActive(p.connected);
                    if (!p.connected)
                    {
                        p.hovered = null;
                        p.dot.gameObject.SetActive(false);
                        continue;
                    }
                    if (pressed) Select(p); else Pick(p);
                    if (p.hovered != null) p.hovered.hover = true;
                    var length = p.distance ?? 2.5f;
                    p.line.SetPositionAndRotation(p.ray.origin, Quaternion.LookRotation(p.ray.direction));
                    p.line.localScale = new Vector3(0.002f, 0.002f, length);
                    p.dot.gameObject.SetActive(p.distance != null);
                    if (p.distance != null)
                    {
                        p.dot.SetPositionAndRotation(p.ray.GetPoint(length - 0.004f), Quaternion.LookRotation(p.ray.direction));
                        p.dot.localScale = Vector3.one * ((p.hovered != null ? 1.5f : 1) * Mathf.Max(1, length / 1.4f));
                    }
                }
            }
            else if (Mouse.current != null)
            {
                foreach (var p in pointers) { p.line.gameObject.SetActive(false); p.dot.gameObject.SetActive(false); }
                mousePointer.ray = cam.ScreenPointToRay(Mouse.current.position.ReadValue());
                if (Mouse.current.leftButton.wasPressedThisFrame) Select(mousePointer); else Pick(mousePointer);
                if (mousePointer.hovered != null) mousePointer.hovered.hover = true;
            }
            Ui.AnimateElements(dt);

            if (environment.activeSelf)
            {
                for (var i = 0; i < motes.Length; i++)
                {
                    var b = moteBase[i];
                    motes[i].localPosition = new Vector3(b.x + Mathf.Sin(t * 0.18f + i) * 0.25f, b.y + Mathf.Sin(t * 0.25f + i * 1.7f) * 0.3f, b.z);
                }
            }

            Voice.Tick(dt);
            Screens.Frame(t, dt);
        }
    }
}
