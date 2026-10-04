# Advisor3D for Quest (Unity)

The LincLife guided assessment as a native Quest app. It follows the live site
(`codelinc_frontend` on `main`, at https://codelinc.codehawks.org): the same five screens (Home,
Basics, Chat with Abe, Review, Results), the same copy, colors and math, and the same AI backend
reading what you say or type. It replaces the WebXR prototype in [`../advisor3d/`](../advisor3d/).

**Status: builds, installs and runs on a Quest 3S.** The five screens, pointing and the Basics
form have been used in the headset. Not yet confirmed there: the answer line (headset keyboard,
dictation and the AI's reply), passthrough, and the recentering and start-over shortcuts.

## Build it onto the headset

You need Unity **6000.3.25f1** with **Android Build Support** (including the SDK, NDK and
OpenJDK it offers), installed from Unity Hub and signed in. That takes about 20 GB of disk.

```sh
./build.sh              # builds Builds/advisor3d.apk, installs it, starts it
./build.sh --no-install # build only
```

The headset must be connected by USB with developer mode on. The first build takes a while:
Unity imports the packages, sets the project up, and compiles for the headset.

You can also open the folder in Unity Hub and use the **Advisor3D** menu:

- **Set Up Project** writes the Quest settings (OpenXR with the Meta Quest features, IL2CPP,
  ARM64, Vulkan, 4x MSAA) and creates `Assets/Scenes/Main.unity`. Run it once, then commit the
  `.meta` files and settings Unity generates.
- **Build APK** does the setup and builds.
- **Take Screenshots** renders the five screens to `Shots~/` without a headset.

Press Play in the editor to try it at a desk: the mouse points, a click selects, and number
keys type into the number pad.

## In the headset

Point at a button and pull the trigger, or put the controllers down and pinch. The app starts
in the VR room; **Show My Real Room** under the footer switches to passthrough. The panels
place themselves in front of you at your eye height, seated or standing.

Tap B or Y to bring the panels back in front of you, or just turn or step away from them and
they follow. Hold B or Y to start over; the app also starts over when the headset has been off
for ten seconds, so the next person at a demo gets a clean Home screen.

In the chat you can tap a suggestion, use the number pad, or point at the answer line. The
answer line opens the headset's keyboard, where you can type or press its microphone key and
speak. That answer goes to the site's AI (`POST /api/intake`, see `Assets/Scripts/Backend.cs`),
which reads it into a field; the app checks the reading and does all the math itself. Tapped
suggestions and number-pad answers are read by the built-in script, and so is everything when
the AI can't be reached. **What Abe knows**, under Abe on the left, lists the answers so far;
the x beside each one takes it back.

## How it maps to the site

The logic files are ports of the site's, and keep its order, so the two can be read side by side.

| Unity (`Assets/Scripts/`) | Site (`codelinc_frontend/src/`) |
| --- | --- |
| `Calculator.cs` | `domain/calculator.ts` |
| `Script.cs` | `intake/script.ts`, `guide/guide.ts` |
| `Backend.cs` | `intake/ai.ts` |
| `Store.cs` | `lib/store.ts` |
| `Guide.cs` | `guide/Avatar.tsx` |
| `Screens.cs` | `Home.tsx`, `intake/Prepare.tsx`, `intake/Chat.tsx`, `intake/Knows.tsx`, `intake/Review.tsx`, `results/Results.tsx` |
| `Ui.cs`, `App.cs`, `MeshGen.cs`, `Resources/Shaders/` | the headset UI kit and room (from `advisor3d/src/xr/`) |

When the site changes the calculator or the script, change these copies too.

What is different from the site:

- Everything is built in code when the app starts. The scene holds one object, `App`.
- The web version painted each element on a 2D canvas. Here each element draws meshes and
  TextMeshPro text with the same calls (`ctx.Rect`, `ctx.Text`, `ctx.Icon`).
- Text is set in Inter (`Assets/Resources/Fonts/`, SIL Open Font License) in place of the
  browser's system font.
- Answers live in memory and are cleared when the app closes.
- Amounts can be entered on a number pad, since a headset has no keyboard to hand.
- Abe's poses on the Basics form are not here; he stands on the left as a small sculpture.
- The ElevenLabs voice agent from the WebXR branch is gone. Speaking goes through the headset
  keyboard's dictation and the site's AI instead.
- There are no controller or hand models; you see the pointer rays. In passthrough you see
  your real hands.

## Tests

The calculator and the chat script have no Unity types, so they run without it:

```sh
dotnet run --project Tests~
```

These are the site's tests (`codelinc_frontend/tests/`) ported to C#, plus a run through the whole
scripted chat.

## Not checked yet

- The answer line in the chat: the headset keyboard opening, dictation, and the reply from the AI
  on the device (the same request works from a computer).
- Passthrough ("Show My Real Room").
- Recentering (tap B or Y, or turn away from the panels) and starting over (hold B or Y, or
  leave the headset off for ten seconds). The thresholds are constants at the top of `App.cs`.
