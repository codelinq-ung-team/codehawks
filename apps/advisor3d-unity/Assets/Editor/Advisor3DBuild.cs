// Project setup and builds, from the Advisor3D menu or the command line (see README.md):
//   Unity -batchmode -quit -projectPath apps/advisor3d-unity -executeMethod Advisor3D.EditorTools.Advisor3DBuild.BuildApk
// Setup writes the Quest settings (OpenXR, IL2CPP, ARM64, Vulkan) and the one scene, so nothing
// in this project has to be clicked together by hand.
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEditor.XR.OpenXR.Features;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.Management;
using UnityEngine.XR.OpenXR;

namespace Advisor3D.EditorTools
{
    public static class Advisor3DBuild
    {
        const string SCENE = "Assets/Scenes/Main.unity";
        const string APK = "Builds/advisor3d.apk";
        const string APP_ID = "org.codehawks.advisor3d";
        const string VOICE_ENDPOINT = "Assets/Resources/voice-endpoint.txt"; // optional and git-ignored; see README.md
        const string SITE = "Assets/Resources/site.txt";                     // the same, for the whole backend

        // What the app needs from OpenXR on a Quest: the Quest runtime, its controllers, tracked
        // hands with an aim ray and pinch, and passthrough.
        static readonly string[] FEATURES =
        {
            "com.unity.openxr.feature.metaquest",
            "com.unity.openxr.feature.input.oculustouch",
            "com.unity.openxr.feature.input.metaquestplus",
            "com.unity.openxr.feature.input.metaquestpro",
            "com.unity.openxr.feature.input.handtrackingsubsystem",
            "com.unity.openxr.feature.metahandmeshdata", // also declares hand tracking in the manifest, so the app can start without controllers
            "com.unity.openxr.feature.input.metahandtrackingaim",
            "com.unity.openxr.feature.arfoundation-meta-session",
            "com.unity.openxr.feature.arfoundation-meta-camera",
            // Passthrough is drawn as a composition layer behind the app. Without this the camera
            // feature starts but the real room never shows.
            "com.unity.openxr.feature.compositionlayers",
        };

        [MenuItem("Advisor3D/Set Up Project")]
        public static void Setup()
        {
            PlayerSettings.companyName = "Codehawks";
            PlayerSettings.productName = "LincLife Advisor3D";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, APP_ID);
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = (AndroidSdkVersions)32;
            PlayerSettings.Android.targetSdkVersion = (AndroidSdkVersions)34;
            PlayerSettings.Android.forceInternetPermission = true; // the site's AI backend
            // Talking with Abe needs the microphone; Unity adds the permission because Voice.cs uses it.
            // Plain http is allowed only while the app is pointed at a backend on your own computer.
            var local = new[] { VOICE_ENDPOINT, SITE }.Any(f => File.Exists(f) && File.ReadAllText(f).TrimStart().StartsWith("http://"));
            PlayerSettings.insecureHttpOption = local ? InsecureHttpOption.AlwaysAllowed : InsecureHttpOption.NotAllowed;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan });

            // The scripts read controllers, hands and the mouse through the Input System package only.
            var player = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset")[0]);
            player.FindProperty("activeInputHandler").intValue = 1;
            player.ApplyModifiedPropertiesWithoutUndo();

            // Thin strokes and panel edges need multisampling in a headset.
            var level = QualitySettings.GetQualityLevel();
            for (var i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.antiAliasing = 4;
            }
            QualitySettings.SetQualityLevel(level, false);

            AlwaysInclude("TextMeshPro/Mobile/Distance Field", "Advisor/Unlit", "Advisor/Lit", "Advisor/Sky");
            SetUpXR();
            SetUpScene();
            AssetDatabase.SaveAssets();
            Debug.Log("Advisor3D: project set up.");
        }

        // Shaders that are only found by name at run time have to be listed, or the build leaves them out.
        static void AlwaysInclude(params string[] names)
        {
            var graphics = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset")[0]);
            var list = graphics.FindProperty("m_AlwaysIncludedShaders");
            foreach (var name in names)
            {
                var shader = Shader.Find(name);
                if (!shader) { Debug.LogWarning($"Advisor3D: shader {name} was not found."); continue; }
                var present = false;
                for (var i = 0; i < list.arraySize; i++) present |= list.GetArrayElementAtIndex(i).objectReferenceValue == shader;
                if (present) continue;
                list.InsertArrayElementAtIndex(list.arraySize);
                list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = shader;
            }
            graphics.ApplyModifiedPropertiesWithoutUndo();
        }

        static void SetUpXR()
        {
            const BuildTargetGroup group = BuildTargetGroup.Android;
            if (!EditorBuildSettings.TryGetConfigObject(XRGeneralSettings.settingsKey, out XRGeneralSettingsPerBuildTarget perTarget) || !perTarget)
            {
                perTarget = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                Directory.CreateDirectory("Assets/XR");
                AssetDatabase.CreateAsset(perTarget, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
                EditorBuildSettings.AddConfigObject(XRGeneralSettings.settingsKey, perTarget, true);
            }
            if (!perTarget.HasSettingsForBuildTarget(group)) perTarget.CreateDefaultSettingsForBuildTarget(group);
            if (!perTarget.HasManagerSettingsForBuildTarget(group)) perTarget.CreateDefaultManagerSettingsForBuildTarget(group);
            var manager = perTarget.ManagerSettingsForBuildTarget(group);
            const string LOADER = "UnityEngine.XR.OpenXR.OpenXRLoader";
            if (!manager.activeLoaders.Any(l => l && l.GetType().FullName == LOADER) && !XRPackageMetadataStore.AssignLoader(manager, LOADER, group))
            {
                throw new Exception("Advisor3D: could not turn on the OpenXR loader for Android.");
            }
            EditorUtility.SetDirty(perTarget);

            FeatureHelpers.RefreshFeatures(group);
            var settings = OpenXRSettings.GetSettingsForBuildTargetGroup(group);
            if (!settings) throw new Exception("Advisor3D: OpenXR has no settings for Android.");
            settings.renderMode = OpenXRSettings.RenderMode.SinglePassInstanced;
            foreach (var id in FEATURES)
            {
                var feature = FeatureHelpers.GetFeatureWithIdForBuildTarget(group, id);
                if (!feature) { Debug.LogWarning($"Advisor3D: OpenXR feature {id} was not found."); continue; }
                feature.enabled = true;
                EditorUtility.SetDirty(feature);
            }
            // The chat's answer line opens the headset's own keyboard, which also takes dictation.
            var quest = FeatureHelpers.GetFeatureWithIdForBuildTarget(group, "com.unity.openxr.feature.metaquest");
            if (quest)
            {
                var so = new SerializedObject(quest);
                so.FindProperty("enableSystemKeyboard").boolValue = true;
                so.ApplyModifiedPropertiesWithoutUndo();
            }
            // An earlier version of this script turned on the Microsoft hand profile by mistake (it shares an old id).
            var stray = FeatureHelpers.GetFeatureWithIdForBuildTarget(group, "com.unity.openxr.feature.input.handtracking");
            if (stray) { stray.enabled = false; EditorUtility.SetDirty(stray); }
            EditorUtility.SetDirty(settings);
        }

        // One scene with one object. App builds the room, the panels and the pointers when it wakes.
        static void SetUpScene()
        {
            if (!File.Exists(SCENE))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(SCENE));
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                new GameObject("App").AddComponent<App>();
                EditorSceneManager.SaveScene(scene, SCENE);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(SCENE, true) };
        }

        [MenuItem("Advisor3D/Build APK")]
        public static void BuildApk()
        {
            Setup();
            Directory.CreateDirectory(Path.GetDirectoryName(APK));
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { SCENE },
                locationPathName = APK,
                target = BuildTarget.Android,
                targetGroup = BuildTargetGroup.Android,
                options = BuildOptions.None,
            });
            var ok = report.summary.result == BuildResult.Succeeded;
            Debug.Log(ok ? $"Advisor3D: built {APK} ({report.summary.totalSize / (1024 * 1024)} MB)." : $"Advisor3D: build failed with {report.summary.totalErrors} errors.");
            if (Application.isBatchMode) EditorApplication.Exit(ok ? 0 : 1);
        }

        // Renders each screen to Shots~/ without entering play mode, to check the layout on a desk.
        [MenuItem("Advisor3D/Take Screenshots")]
        public static void Shots()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var app = new GameObject("App").AddComponent<App>();
            app.Build();
            Directory.CreateDirectory("Shots~");

            var target = new RenderTexture(2400, 1350, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB) { antiAliasing = 4 };
            var cam = App.cam;
            cam.targetTexture = target;
            cam.aspect = 2400f / 1350f;
            cam.transform.position = new Vector3(0, App.EYE - 0.08f, -0.75f);
            cam.transform.LookAt(App.FOCUS);

            void Shot(string name)
            {
                Screens.Frame(0, 0.016f);
                Canvas.ForceUpdateCanvases();
                cam.Render();
                RenderTexture.active = target;
                var image = new Texture2D(target.width, target.height, TextureFormat.RGB24, false);
                image.ReadPixels(new Rect(0, 0, target.width, target.height), 0, 0);
                image.Apply();
                RenderTexture.active = null;
                File.WriteAllBytes($"Shots~/{name}.png", image.EncodeToPNG());
                UnityEngine.Object.DestroyImmediate(image);
            }

            Screens.Jump("home");
            Shot("1-home");
            Screens.Jump("prepare");
            Shot("2-basics");
            Store.Set(s =>
            {
                s.form = new Form { income = 85000, marital = "married", dependents = 2, debt = 280000, coverage = true };
                Script.ApplyForm(s);
                s.started = true;
            });
            // Part-way through a spoken chat, so the transcript and the ring have something to show.
            Store.Set(s =>
            {
                s.profile["household"] = Field.Of(Status.Proposed, "both");
                s.profile["youngestAge"] = Field.Of(Status.Proposed, 4);
                s.profile["support"] = Field.Of(Status.Proposed, 60000);
                s.profile["years"] = Field.Of(Status.Proposed, 18);
                s.profile["mortgage"] = Field.Of(Status.Proposed, 240000);
                s.profile["otherDebts"] = Field.Of(Status.Proposed, 40000);
                s.messages.Add(new Message { role = "bot", text = "Thanks. And how many years should that support last?" });
                s.messages.Add(new Message { role = "user", text = "Until the kids are through college, so about eighteen years." });
                s.messages.Add(new Message { role = "bot", text = "Got it, 18 years. Of your $280,000 in debt, how much is the mortgage?" });
                s.messages.Add(new Message { role = "user", text = "Two hundred and forty thousand." });
                var q = Script.Ask(Script.NextStep(s), s);
                s.messages.Add(new Message { role = "bot", text = "Thanks, that leaves $40,000 in other debts. " + q.text, replies = q.replies });
            });
            Screens.Jump("chat");
            Shot("3-chat");
            // The same moment seen as the wearer sees it: looking down at the ring, then round to the right.
            var eye = new Vector3(0, App.EYE, 0);
            void From(Vector3 from, Vector3 at) { cam.transform.position = from; cam.transform.LookAt(at); }
            cam.fieldOfView = 80;
            From(eye, new Vector3(0, 0.75f, 1.5f));
            Shot("3b-chat-ring");
            From(eye, new Vector3(1.5f, 0.6f, -0.3f));
            Shot("3c-chat-years");

            cam.fieldOfView = 50;
            From(new Vector3(0, App.EYE - 0.08f, -0.75f), App.FOCUS);
            Store.LoadSample();
            Screens.Jump("review");
            Shot("4-review");
            Screens.Jump("results");
            Shot("5-results");
            cam.fieldOfView = 80;
            From(eye, new Vector3(0, 0.75f, 1.3f));
            Shot("5b-results-stacks");
            Screens.TurnTo(1);
            From(eye, new Vector3(1.5f, 0.7f, -0.2f));
            Shot("6-results-years-right");
            From(eye, new Vector3(-1.2f, 0.8f, -1.0f));
            Shot("6b-results-years-behind");
            Screens.TurnTo(4);
            From(eye, new Vector3(0, 0.75f, 1.3f));
            Shot("7-results-gap");
            Screens.TurnTo(5);
            From(eye, new Vector3(1.5f, 0.7f, -0.2f));
            Shot("8-results-time");
            cam.fieldOfView = 50;
            From(new Vector3(0, App.EYE - 0.08f, -0.75f), App.FOCUS);
            Screens.TurnTo(6);
            Shot("9-results-try");

            cam.targetTexture = null;
            target.Release();
            Debug.Log("Advisor3D: screenshots are in Shots~/.");
            if (Application.isBatchMode) EditorApplication.Exit(0);
        }
    }
}
