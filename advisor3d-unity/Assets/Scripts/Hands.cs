// The wearer's hands in the VR room, drawn as soft white cartoon gloves with a burgundy cuff:
// thick rounded fingers and a filled palm, so they read as a hand and not as a skeleton or as
// floating dots (two earlier tries). They follow the headset's hand tracking (XR Hands).
// While a controller is held there is no hand to track, so a closed glove shows where it is.
// In passthrough the real hands are visible, so these are hidden.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.Hands;

namespace Advisor3D
{
    public class Hands
    {
        // Each finger from its knuckle to its tip, with how thick it is at the knuckle, in meters.
        static readonly (XRHandJointID[] joints, float width)[] FINGERS =
        {
            (new[] { XRHandJointID.ThumbMetacarpal, XRHandJointID.ThumbProximal, XRHandJointID.ThumbDistal, XRHandJointID.ThumbTip }, 0.021f),
            (new[] { XRHandJointID.IndexProximal, XRHandJointID.IndexIntermediate, XRHandJointID.IndexDistal, XRHandJointID.IndexTip }, 0.019f),
            (new[] { XRHandJointID.MiddleProximal, XRHandJointID.MiddleIntermediate, XRHandJointID.MiddleDistal, XRHandJointID.MiddleTip }, 0.019f),
            (new[] { XRHandJointID.RingProximal, XRHandJointID.RingIntermediate, XRHandJointID.RingDistal, XRHandJointID.RingTip }, 0.018f),
            (new[] { XRHandJointID.LittleProximal, XRHandJointID.LittleIntermediate, XRHandJointID.LittleDistal, XRHandJointID.LittleTip }, 0.016f),
        };
        const float TAPER = 0.8f;   // a fingertip is this much of the knuckle's width
        const float PALM = 0.026f;  // how thick the palm is

        // One rounded piece of the glove: a ball at each end and a tube between them.
        class Segment
        {
            public XRHandJointID from, to;
            public float fromWidth, toWidth;
            public Transform tube, cap;
        }

        class Hand
        {
            public GameObject root, fist;
            public Transform cuff;
            public readonly List<Segment> segments = new List<Segment>();
            public readonly Dictionary<XRHandJointID, Pose> at = new Dictionary<XRHandJointID, Pose>();
        }

        readonly Hand left, right;
        static readonly List<XRHandSubsystem> subsystems = new List<XRHandSubsystem>();
        static Mesh tube;
        XRHandSubsystem tracking;

        public Hands(Transform parent)
        {
            if (!tube) tube = MeshGen.Cylinder(0.5f, 1, 20);
            var glove = Mat.Lit(Color.white);
            var cuff = Mat.Lit(T.tint);
            left = Build("Left Hand", parent, glove, cuff);
            right = Build("Right Hand", parent, glove, cuff);
        }

        static Hand Build(string name, Transform parent, Material glove, Material cuffMaterial)
        {
            var h = new Hand { root = new GameObject(name) };
            h.root.transform.SetParent(parent, false);
            void Add(XRHandJointID from, XRHandJointID to, float fromWidth, float toWidth)
            {
                h.at[from] = h.at[to] = default;
                h.segments.Add(new Segment
                {
                    from = from, to = to, fromWidth = fromWidth, toWidth = toWidth,
                    tube = Mat.Spawn("Tube", tube, glove, h.root.transform),
                    cap = Mat.Spawn("Cap", MeshGen.Sphere(), glove, h.root.transform),
                });
            }
            foreach (var (joints, width) in FINGERS)
            {
                for (var i = 1; i < joints.Length; i++)
                {
                    float a = Mathf.Lerp(1, TAPER, (i - 1f) / (joints.Length - 1)), b = Mathf.Lerp(1, TAPER, (float)i / (joints.Length - 1));
                    Add(joints[i - 1], joints[i], width * a, width * b);
                }
            }
            // The palm: a thick web from the wrist to each knuckle, and across the knuckles.
            foreach (var knuckle in new[] { XRHandJointID.IndexProximal, XRHandJointID.MiddleProximal, XRHandJointID.RingProximal, XRHandJointID.LittleProximal, XRHandJointID.ThumbMetacarpal })
            {
                Add(XRHandJointID.Wrist, knuckle, PALM, PALM);
            }
            Add(XRHandJointID.IndexProximal, XRHandJointID.MiddleProximal, PALM, PALM);
            Add(XRHandJointID.MiddleProximal, XRHandJointID.RingProximal, PALM, PALM);
            Add(XRHandJointID.RingProximal, XRHandJointID.LittleProximal, PALM, PALM);
            Add(XRHandJointID.ThumbMetacarpal, XRHandJointID.IndexProximal, PALM, PALM);

            h.cuff = Mat.Spawn("Cuff", tube, cuffMaterial, h.root.transform);
            h.root.SetActive(false);

            // What stands in for the hand while it holds a controller: a closed glove and its cuff.
            h.fist = new GameObject(name + " Fist");
            h.fist.transform.SetParent(parent, false);
            Mat.Spawn("Glove", MeshGen.Sphere(), glove, h.fist.transform).localScale = new Vector3(0.062f, 0.058f, 0.078f);
            var band = Mat.Spawn("Cuff", tube, cuffMaterial, h.fist.transform);
            band.localScale = new Vector3(0.05f, 0.022f, 0.05f);
            band.localPosition = new Vector3(0, 0, -0.045f);
            band.localRotation = Quaternion.Euler(90, 0, 0);
            h.fist.SetActive(false);
            return h;
        }

        XRHandSubsystem Tracking()
        {
            if (tracking != null && tracking.running) return tracking;
            SubsystemManager.GetSubsystems(subsystems);
            tracking = null;
            foreach (var s in subsystems) if (s.running) tracking = s;
            return tracking;
        }

        // grip: where each controller is, or null when that hand holds none. Poses from the hand
        // subsystem and the controllers are both in the headset's tracking space, which is world space here.
        public void Tick(bool show, Pose? leftGrip, Pose? rightGrip)
        {
            var t = show ? Tracking() : null;
            Show(left, t != null ? t.leftHand : default, t != null, show ? leftGrip : null);
            Show(right, t != null ? t.rightHand : default, t != null, show ? rightGrip : null);
        }

        static void Show(Hand h, XRHand hand, bool available, Pose? grip)
        {
            var tracked = available && grip == null && hand.isTracked && Read(h, hand);
            if (h.root.activeSelf != tracked) h.root.SetActive(tracked);
            var held = grip != null;
            if (h.fist.activeSelf != held) h.fist.SetActive(held);
            if (held) h.fist.transform.SetPositionAndRotation(grip.Value.position, grip.Value.rotation);
            if (!tracked) return;

            foreach (var s in h.segments)
            {
                Vector3 a = h.at[s.from].position, b = h.at[s.to].position;
                var along = b - a;
                var length = Mathf.Max(along.magnitude, 1e-4f);
                // The tube runs along its own Y. It is as wide as the thicker end, which the caps round off.
                s.tube.SetPositionAndRotation((a + b) / 2, Quaternion.FromToRotation(Vector3.up, along / length));
                s.tube.localScale = new Vector3((s.fromWidth + s.toWidth) / 2, length, (s.fromWidth + s.toWidth) / 2);
                s.cap.position = b;
                s.cap.localScale = Vector3.one * s.toWidth;
            }

            // The cuff sits just behind the wrist, in line with the forearm.
            var wrist = h.at[XRHandJointID.Wrist];
            var toward = (h.at[XRHandJointID.MiddleProximal].position - wrist.position).normalized;
            if (toward.sqrMagnitude < 0.5f) toward = wrist.rotation * Vector3.forward;
            h.cuff.SetPositionAndRotation(wrist.position - toward * 0.012f, Quaternion.FromToRotation(Vector3.up, toward));
            h.cuff.localScale = new Vector3(0.058f, 0.024f, 0.058f);
        }

        // Every joint the glove uses must have a pose this frame, or the hand is not drawn.
        static readonly List<XRHandJointID> ids = new List<XRHandJointID>();
        static bool Read(Hand h, XRHand hand)
        {
            ids.Clear();
            ids.AddRange(h.at.Keys);
            foreach (var id in ids)
            {
                if (!hand.GetJoint(id).TryGetPose(out var pose)) return false;
                h.at[id] = pose;
            }
            return true;
        }
    }
}
