// Reading the pairing QR code (Scanner.cs) uses the Quest's passthrough cameras, which need a
// Horizon OS permission Unity does not know to add. This writes it into the generated manifest.
using System.IO;
using System.Xml;
using UnityEditor.Android;

namespace Advisor3D.EditorTools
{
    public class HeadsetCamera : IPostGenerateGradleAndroidProject
    {
        const string ANDROID = "http://schemas.android.com/apk/res/android";
        static readonly string[] PERMISSIONS = { "android.permission.CAMERA", "horizonos.permission.HEADSET_CAMERA" };

        public int callbackOrder => 100;

        public void OnPostGenerateGradleAndroidProject(string path)
        {
            var file = Path.Combine(path, "src", "main", "AndroidManifest.xml");
            var manifest = new XmlDocument();
            manifest.Load(file);
            var root = manifest.DocumentElement;
            foreach (var permission in PERMISSIONS)
            {
                var present = false;
                foreach (XmlNode node in root.ChildNodes)
                {
                    present |= node.Name == "uses-permission" && node.Attributes?["name", ANDROID]?.Value == permission;
                }
                if (present) continue;
                var element = manifest.CreateElement("uses-permission");
                element.SetAttribute("name", ANDROID, permission);
                root.AppendChild(element);
            }
            manifest.Save(file);
        }
    }
}
