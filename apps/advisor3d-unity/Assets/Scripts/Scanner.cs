// Looks for the site's pairing QR code through the headset's cameras. On a Quest the passthrough
// cameras show up as ordinary webcams once the wearer allows them (Horizon OS v74 or later, Quest 3
// and 3S); in the editor the computer's webcam stands in. Frames are read a few times a second
// by ZXing on a background thread, so looking for a code never holds up a frame.
using System;
using System.Collections;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;
using ZXing;
using ZXing.Common;
using ZXing.QrCode;

namespace Advisor3D
{
    public static class Scanner
    {
        public static string Status { get; private set; } = "off"; // off | asking | looking | unavailable
        public static Action<string> Found; // called with a pairing id (see Pairing.ReadQr)
        public static WebCamTexture View => Status == "looking" ? camera : null; // what the cameras see, to show the wearer

        const int WIDTH = 1280, HEIGHT = 960; // the largest size the Quest's cameras offer
        const float EVERY = 0.3f;             // seconds between frames handed to the reader
        const string HEADSET_CAMERA = "horizonos.permission.HEADSET_CAMERA";

        // Spend longer on each frame: a code on a bright monitor, seen at an angle, is not an easy read.
        static readonly System.Collections.Generic.Dictionary<DecodeHintType, object> HARDER =
            new System.Collections.Generic.Dictionary<DecodeHintType, object> { [DecodeHintType.TRY_HARDER] = true };

        static WebCamTexture camera;
        static bool seen; // the first frame has arrived (logged once)
        static Color32[] pixels;
        static Task<string> reading;
        static float wait;
        static int run; // which Start() this is; an older one still asking for permission gives up

        public static void Start()
        {
            // The editor's screenshot pass has no frames and no camera.
            if (!Application.isPlaying || Status == "asking" || Status == "looking") return;
            Status = "asking";
            App.I.StartCoroutine(Begin(++run));
        }

        public static void Stop()
        {
            run += 1;
            if (camera) { camera.Stop(); UnityEngine.Object.Destroy(camera); }
            camera = null;
            reading = null;
            Status = "off";
        }

        static IEnumerator Begin(int id)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            var needed = new[] { UnityEngine.Android.Permission.Camera, HEADSET_CAMERA }
                .Where(p => !UnityEngine.Android.Permission.HasUserAuthorizedPermission(p)).ToArray();
            if (needed.Length > 0)
            {
                var answers = 0;
                var callbacks = new UnityEngine.Android.PermissionCallbacks();
                callbacks.PermissionGranted += _ => answers += 1;
                callbacks.PermissionDenied += _ => answers += 1;
                UnityEngine.Android.Permission.RequestUserPermissions(needed, callbacks);
                var asked = Time.realtimeSinceStartup;
                while (answers < needed.Length && Time.realtimeSinceStartup - asked < 60) yield return null;
                if (id != run) yield break;
                if (needed.Any(p => !UnityEngine.Android.Permission.HasUserAuthorizedPermission(p)))
                {
                    Debug.LogWarning("Advisor3D: the camera was not allowed, so the pairing code can only be typed.");
                    Status = "unavailable";
                    yield break;
                }
            }
#else
            yield return Application.RequestUserAuthorization(UserAuthorization.WebCam);
            if (id != run) yield break;
            if (!Application.HasUserAuthorization(UserAuthorization.WebCam)) { Status = "unavailable"; yield break; }
#endif
            if (WebCamTexture.devices.Length == 0)
            {
                Debug.LogWarning("Advisor3D: no camera was found, so the pairing code can only be typed.");
                Status = "unavailable";
                yield break;
            }
            camera = new WebCamTexture(WebCamTexture.devices[0].name, WIDTH, HEIGHT, 30);
            camera.Play();
            wait = 0;
            seen = false;
            Status = "looking";
            Debug.Log($"Advisor3D: looking for a pairing code with the camera \"{camera.deviceName}\".");
        }

        public static void Tick(float dt)
        {
            if (Status != "looking" || !camera) return;
            if (reading != null)
            {
                if (!reading.IsCompleted) return;
                var text = reading.Status == TaskStatus.RanToCompletion ? reading.Result : null;
                reading = null;
                var id = Pairing.ReadQr(text);
                if (id != null) { Found?.Invoke(id); return; }
                if (text != null) Debug.Log("Advisor3D: read a QR code that is not a LincLife pairing.");
            }
            wait -= dt;
            // Until the first real frame arrives the texture reports a 16 by 16 placeholder.
            if (wait > 0 || !camera.didUpdateThisFrame || camera.width < 100) return;
            wait = EVERY;

            int w = camera.width, h = camera.height;
            if (!seen) { seen = true; Debug.Log($"Advisor3D: the camera is sending {w} by {h} pictures."); }
            if (pixels == null || pixels.Length != w * h) pixels = new Color32[w * h];
            camera.GetPixels32(pixels);
            // Green is close enough to brightness for black on white. Unity's rows run bottom to
            // top, which would mirror the code, so they are turned the right way up here.
            var gray = new byte[w * h];
            for (var y = 0; y < h; y++)
            {
                var from = (h - 1 - y) * w;
                var to = y * w;
                for (var x = 0; x < w; x++) gray[to + x] = pixels[from + x].g;
            }
            reading = Task.Run(() => Read(gray, w, h));
        }

        // The text of a QR code in a grayscale picture, or null when there is none.
        public static string Read(byte[] gray, int width, int height)
        {
            var source = new RGBLuminanceSource(gray, width, height, RGBLuminanceSource.BitmapFormat.Gray8);
            var result = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source)), HARDER);
            return result?.Text;
        }
    }
}
