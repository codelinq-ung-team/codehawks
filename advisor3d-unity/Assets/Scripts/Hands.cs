// The wearer's hands in the VR room: a light skeleton of burgundy bones with an orange dot on
// each fingertip, in the app's own colors. They follow the headset's hand tracking (XR Hands).
// While a controller is held there is no hand to track, so a small marker shows where it is.
// In passthrough the real hands are visible, so these are hidden.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.Hands;

namespace Advisor3D
{
    public class Hands
    {
        const float BONE = 0.007f, JOINT = 0.0095f, TIP = 0.012f; // meters across

        // Wrist to fingertip, one row per finger.
        static readonly XRHandJointID[][] FINGERS =
        {
            new[] { XRHandJointID.Wrist, XRHandJointID.ThumbMetacarpal, XRHandJointID.ThumbProximal, XRHandJointID.ThumbDistal, XRHandJointID.ThumbTip },
            new[] { XRHandJointID.Wrist, XRHandJointID.IndexMetacarpal, XRHandJointID.IndexProximal, XRHandJointID.IndexIntermediate, XRHandJointID.IndexDistal, XRHandJointID.IndexTip },
            new[] { XRHandJointID.Wrist, XRHandJointID.MiddleMetacarpal, XRHandJointID.MiddleProximal, XRHandJointID.MiddleIntermediate, XRHandJointID.MiddleDistal, XRHandJointID.MiddleTip },
            new[] { XRHandJointID.Wrist, XRHandJointID.RingMetacarpal, XRHandJointID.RingProximal, XRHandJointID.RingIntermediate, XRHandJointID.RingDistal, XRHandJointID.RingTip },
            new[] { XRHandJointID.Wrist, XRHandJointID.LittleMetacarpal, XRHandJointID.LittleProximal, XRHandJointID.LittleIntermediate, XRHandJointID.LittleDistal, XRHandJointID.LittleTip },
        };
        // The knuckles, joined across the palm.
        static readonly XRHandJointID[] KNUCKLES = { XRHandJointID.IndexProximal, XRHandJointID.MiddleProximal, XRHandJointID.RingProximal, XRHandJointID.LittleProximal };

        class Hand
        {
            public GameObject root, marker;
            public readonly Dictionary<XRHandJointID, Transform> joints = new Dictionary<XRHandJointID, Transform>();
            public readonly List<(Transform bone, XRHandJointID from, XRHandJointID to)> bones = new List<(Transform, XRHandJointID, XRHandJointID)>();
            public readonly Dictionary<XRHandJointID, Vector3> at = new Dictionary<XRHandJointID, Vector3>();
        }

        readonly Hand left, right;
        static readonly List<XRHandSubsystem> subsystems = new List<XRHandSubsystem>();
        XRHandSubsystem tracking;

        public Hands(Transform parent)
        {
            var bone = Mat.Lit(T.tint);
            var tip = Mat.Lit(T.highlight);
            left = Build("Left Hand", parent, bone, tip);
            right = Build("Right Hand", parent, bone, tip);
        }

        static Hand Build(string name, Transform parent, Material bone, Material tip)
        {
            var h = new Hand { root = new GameObject(name) };
            h.root.transform.SetParent(parent, false);
            void Link(XRHandJointID from, XRHandJointID to) => h.bones.Add((Mat.Spawn("Bone", MeshGen.Beam(), bone, h.root.transform), from, to));
            foreach (var finger in FINGERS)
            {
                for (var i = 0; i < finger.Length; i++)
                {
                    var id = finger[i];
                    var last = i == finger.Length - 1;
                    if (!h.joints.ContainsKey(id))
                    {
                        var joint = Mat.Spawn("Joint", MeshGen.Sphere(), last ? tip : bone, h.root.transform);
                        joint.localScale = Vector3.one * (last ? TIP : JOINT);
                        h.joints[id] = joint;
                    }
                    if (i > 0) Link(finger[i - 1], id);
                }
            }
            for (var i = 1; i < KNUCKLES.Length; i++) Link(KNUCKLES[i - 1], KNUCKLES[i]);
            h.root.SetActive(false);

            // What stands in for the hand while it holds a controller.
            h.marker = new GameObject(name + " Marker");
            h.marker.transform.SetParent(parent, false);
            Mat.Spawn("Palm", MeshGen.Sphere(), bone, h.marker.transform).localScale = Vector3.one * 0.03f;
            var dot = Mat.Spawn("Dot", MeshGen.Sphere(), tip, h.marker.transform);
            dot.localScale = Vector3.one * TIP;
            dot.localPosition = new Vector3(0, 0, 0.022f);
            h.marker.SetActive(false);
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
            if (h.marker.activeSelf != held) h.marker.SetActive(held);
            if (held) h.marker.transform.SetPositionAndRotation(grip.Value.position, grip.Value.rotation);
            if (!tracked) return;

            foreach (var kv in h.joints) kv.Value.position = h.at[kv.Key];
            foreach (var (bone, from, to) in h.bones)
            {
                Vector3 a = h.at[from], b = h.at[to];
                var along = b - a;
                var length = along.magnitude;
                bone.gameObject.SetActive(length > 1e-4f);
                if (length <= 1e-4f) continue;
                bone.SetPositionAndRotation(a, Quaternion.LookRotation(along));
                bone.localScale = new Vector3(BONE, BONE, length);
            }
        }

        // Every joint the skeleton uses must have a position this frame, or the hand is not drawn.
        static bool Read(Hand h, XRHand hand)
        {
            foreach (var id in h.joints.Keys)
            {
                if (!hand.GetJoint(id).TryGetPose(out var pose)) return false;
                h.at[id] = pose.position;
            }
            return true;
        }
    }
}
