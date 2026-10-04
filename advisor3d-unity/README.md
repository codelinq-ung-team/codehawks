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
the AI can't be reached. That is the fallback, though: the chat opens by talking (see
[Talking with Abe](#talking-with-abe)). Abe stands in the middle of the card, the transcript is
on the left, and **What Abe knows** on the right lists the answers so far; the x beside each one
takes it back. With voice off, the number pad takes that side for questions that want a number.

## Talking with Abe

The Basics form is tapped; the chat is spoken. Opening the chat starts a voice conversation:
Abe, in the middle of the card, greets you and asks the open question out loud, his mouth
moving as he speaks, and you just answer. Each answer fills the same profile the tapped and
typed ones fill, and everything said is written to the transcript on the left. **Stop Talking**
and **Talk to Abe**, at the top of the card, turn voice off and on. If voice can't start, Abe's
written opening lines appear and the chat works by tapping and typing, as on the site. It uses
OpenAI's Realtime API (`gpt-realtime-2.1`, voice `ash`). **Not yet tried with a real API key,
in the editor or on a headset.** The code compiles and the logic is tested, nothing more.

- `Voice.cs` sends the microphone to OpenAI over a WebSocket and plays what comes back.
  `Guide.cs` opens and closes Abe's mouth with the loudness of his voice.
- The app stays in charge. The model reports each answer by calling `record_answer`;
  `VoiceScript.cs` puts it through the chat script's own checks (`Script.Interpret`: the limits,
  the monthly check, the debt split), saves it, and tells the model what to ask next.
- The API key never ships in the APK. The app asks the backend, `POST /api/voice/session`
  (`backend/voice.py`), for a secret that lasts a minute. The model, the voice, Abe's
  instructions and the tool are set there, so changing how Abe talks is a backend change.
- The headset has no echo cancellation, so the microphone is closed while Abe speaks. You
  can't talk over him; tap an answer if you want to cut in.
- Voice hangs up after the closing words, when you leave the chat or take the headset off,
  and after ten minutes. Tapping, the number pad and typing all keep working while it is on,
  and are all that is left if voice can't start.

The app asks the deployed site for its session, so voice works once the site has an OpenAI
key: `backend/README.md` says how Israel supplies it (a GitHub secret, then a deploy). Nothing
changes in the app or the APK.

To try voice without deploying, run the backend on your computer instead:

```sh
# from the repository root, with your own key
OPENAI_API_KEY=sk-... python -m flask --app backend.app run --port 8000
echo "http://localhost:8000/api/voice/session" > advisor3d-unity/Assets/Resources/voice-endpoint.txt
```

That file is git-ignored and only moves the voice request; delete it to use the site again.
Then, in the editor, run **Advisor3D → Set Up Project** once (it allows plain http while the
file is there), press Play and open the chat. Wear headphones, or the
computer's speakers feed its microphone. For the headset, keep it on USB:

```sh
~/Library/Android/sdk/platform-tools/adb reverse tcp:8000 tcp:8000
./build.sh
```

Usage is billed by audio tokens, not by the minute, so set a spend limit on the OpenAI project
before a demo. `OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini` picks the cheaper model on a local
backend; the deployed one always uses `DEFAULT_MODEL` in `backend/voice.py`.

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
| `Voice.cs`, `VoiceScript.cs` | nothing: the site has no voice |
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
- Abe's poses on the Basics form are not here; he stands on the left as a small sculpture, and
  moves to the middle for the chat.
- The ElevenLabs voice agent from the WebXR branch is gone. Speaking goes through OpenAI
  ([Talking with Abe](#talking-with-abe)), or the headset keyboard's dictation and the site's AI.
- Your hands are drawn as a light skeleton in the app's colors (`Hands.cs`), with a small
  marker in place of a hand that holds a controller. In passthrough you see your real hands.

## Tests

The calculator and the chat script have no Unity types, so they run without it:

```sh
dotnet run --project Tests~
```

These are the site's tests (`codelinc_frontend/tests/`) ported to C#, plus a run through the whole
scripted chat and what the voice model is told (`VoiceScript.cs`).

## Not checked yet

- Talking with Abe, end to end: it has never run against OpenAI. First things to check are the
  microphone permission prompt in the headset, whether Abe's audio is smooth, and whether
  closing the microphone while he speaks is enough to stop him hearing himself.
- The answer line in the chat: the headset keyboard opening, dictation, and the reply from the AI
  on the device (the same request works from a computer).
- Passthrough ("Show My Real Room"). It showed no camera view on the headset; the OpenXR
  composition layers feature it needs was off and is now on, but the fix has not been tried.
- The drawn hands (`Hands.cs`).
- Recentering (tap B or Y, or turn away from the panels) and starting over (hold B or Y, or
  leave the headset off for ten seconds). The thresholds are constants at the top of `App.cs`.
