// The wearer's hands in the VR room, kept abstract on purpose: a soft peach pad for the palm
// and a dot on each fingertip, with the index finger's in orange because it does the pointing.
// No bones or knuckles, which read as a skeleton. They follow the headset's hand tracking
// (XR Hands). While a controller is held there is no hand to track, so a pad shows where it is.
// In passthrough the real hands are visible, so these are hidden.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.Hands;

namespace Advisor3D
{
    public class Hands
    {
        const float TIP = 0.013f;                                             // meters across
        static readonly Vector3 PALM = new Vector3(0.062f, 0.018f, 0.07f);    // wide, thin, long

        static readonly XRHandJointID[] TIPS =
        {
            XRHandJointID.IndexTip, XRHandJointID.ThumbTip, XRHandJointID.MiddleTip, XRHandJointID.RingTip, XRHandJointID.LittleTip,
        };

        class Hand
        {
            public GameObject root;
            public Transform palm;
            public readonly Transform[] tips = new Transform[TIPS.Length];
            public readonly Pose[] at = new Pose[TIPS.Length + 1]; // the tips, then the palm
        }

        readonly Hand left, right;
        static readonly List<XRHandSubsystem> subsystems = new List<XRHandSubsystem>();
        XRHandSubsystem tracking;

        public Hands(Transform parent)
        {
            var pad = Mat.Lit(new Color(T.onBrandMuted.r, T.onBrandMuted.g, T.onBrandMuted.b, 0.9f), transparent: true);
            var dot = Mat.Lit(T.tint);
            var pointing = Mat.Lit(T.highlight);
            left = Build("Left Hand", parent, pad, dot, pointing);
            right = Build("Right Hand", parent, pad, dot, pointing);
        }

        static Hand Build(string name, Transform parent, Material pad, Material dot, Material pointing)
        {
            var h = new Hand { root = new GameObject(name) };
            h.root.transform.SetParent(parent, false);
            h.palm = Mat.Spawn("Palm", MeshGen.Sphere(), pad, h.root.transform);
            h.palm.localScale = PALM;
            for (var i = 0; i < TIPS.Length; i++)
            {
                h.tips[i] = Mat.Spawn("Tip", MeshGen.Sphere(), i == 0 ? pointing : dot, h.root.transform);
                h.tips[i].localScale = Vector3.one * TIP;
            }
            h.root.SetActive(false);
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
            var visible = tracked || grip != null;
            if (h.root.activeSelf != visible) h.root.SetActive(visible);
            if (!visible) return;

            // Holding a controller: just the pad, where the controller is.
            var palm = tracked ? h.at[TIPS.Length] : grip.Value;
            h.palm.SetPositionAndRotation(palm.position, palm.rotation);
            for (var i = 0; i < h.tips.Length; i++)
            {
                h.tips[i].gameObject.SetActive(tracked);
                if (tracked) h.tips[i].position = h.at[i].position;
            }
        }

        // Every part must have a pose this frame, or the hand is not drawn.
        static bool Read(Hand h, XRHand hand)
        {
            for (var i = 0; i < TIPS.Length; i++)
            {
                if (!hand.GetJoint(TIPS[i]).TryGetPose(out h.at[i])) return false;
            }
            return hand.GetJoint(XRHandJointID.Palm).TryGetPose(out h.at[TIPS.Length]);
        }
    }
}
