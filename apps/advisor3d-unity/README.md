# Advisor3D for Quest (Unity)

The LincLife guided assessment as a native Quest app. It follows the live site
(`apps/web` on `main`, at https://codelinc.codehawks.org): the same five screens (Home,
Basics, Chat with Abe, Review, Results), the same copy, colors and math, and the same AI backend
reading what you say or type. It replaces the WebXR prototype in [`../advisor3d-web/`](../advisor3d-web/).

**Status: builds, installs and runs on a Quest 3S.** The five screens, pointing and the Basics
form have been used in the headset. Not yet confirmed there: the answer line (headset keyboard,
dictation and the AI's reply), passthrough, and the recentering and start-over shortcuts.

## Build it onto the headset

You need Unity **6000.3.25f1** with **Android Build Support** (including the SDK, NDK and
OpenJDK it offers), installed from Unity Hub and signed in. That takes about 20 GB of disk.

From `apps/advisor3d-unity/`:

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
[Talking with Abe](#talking-with-abe)). Abe stands at the top of the card with the conversation
running under him, and **What Abe knows** on the left lists the answers so far; the x beside
each one takes it back. With voice off, a number pad on the right takes amounts.

Look down in the chat and there is a ring around you, like a low round table (`Picture.cs`).
In front, each amount you give becomes a block that rises as you answer; round to the sides and
behind you is one post for every year of support. Results takes the estimate a slide at
a time, as the site's results deck does: two stacks on a tray in front of you build up to the
gap, and the posts around you become a staircase of the cost adding up, then stepping down as
the years pass. Each slide says where to look in the room. While the ring is up the panels give you about six seconds to look around
before they come round to face you; tapping B or Y brings them at once.

## The end: a summary, then back to the site

The headset shows the estimate; the site is where it can be copied, questioned and compared.
So the last two screens are a summary and not a conversation. **Not yet tried on a headset.**

- When Abe has said his closing words the chat moves on to Review by itself, about two and a
  half seconds after he goes quiet. Coming back to a finished chat from the step bar stays put.
- On Results, Abe's chat card on the left gives way to **At a glance**: a meter of how much of
  the need is already in place, today's estimate, and the look-ahead under it. There is no Copy
  Summary: a headset has nowhere to paste one.
- **Looking ahead** is one more slide, shown when the wearer answered either of the chat's
  two closing questions (what they expect in the next ten years, and where their income will
  be). `Calc.Outlook` is the site's `outlook()`. The first stack grows by a lighter block, what
  those changes add; the gap grows with it; the ring becomes the years of support there would
  be by then; and the list beside the slide turns into a waterfall from today's total to the
  one in ten years, one bar per change. It never replaces today's number.
- The arrow past the last slide, and **Continue on Your Computer**, open the handoff
  (`Screens.Handoff`): take the headset off, and your results are already open on the site.
  `Sync.cs` marks the pairing `handoff` there, or when the headset comes off on Results, and
  the site opens its results page. A headset used on its own is told how to start from the
  site next time, since it has no browser to hand its answers to.

## Starting on the site

Someone who fills in the Basics form on the site can choose **VR voice chat** there. The site
shows a QR code, and looking for it is the first thing the app does: it opens on a connect
screen, in passthrough so the wearer can see their computer, with a live picture of what the
headset's cameras see. Look at the computer's screen and the app loads those answers, skips
its own Basics form, and opens the chat. **Use the Headset on Its Own** goes to the Home
screen instead, and Start Over comes back to the connect screen. Each answer Abe hears is saved back, the site lists them as they
arrive, and when the wearer reaches the handoff screen the site opens its results page
(see [the end](#the-end-a-summary-then-back-to-the-site)). **Not
yet tried on a headset**: the camera, the permission prompt and the scan are unconfirmed there.

- `Scanner.cs` reads the headset's passthrough cameras as a webcam and hands a frame to ZXing
  (`Assets/Plugins/ZXing/`, Apache 2.0) a few times a second, on a background thread. It needs
  a Quest 3 or 3S on Horizon OS v74 or later, and asks for the camera the first time. In the
  editor it uses the computer's webcam, so a code on a phone held up to it works.
- **Enter a Code Instead** takes the six digits shown under the QR code, for when the camera
  is refused or can't read the screen.
- `Sync.cs` joins the pairing, saves the answers after every change, and marks it done when
  the conversation ends. `Pairing.cs` holds the shapes it shares with the site, and is tested.
  Starting over, or the headset being off for ten seconds, ends the pairing; the site can then
  finish by text with whatever was saved.
- `Assets/Editor/HeadsetCamera.cs` adds the two camera permissions to the manifest at build time.
- Pairing goes through the deployed site (`/api/pair`, see `apps/backend/README.md`), so it
  works once that backend is deployed. To try it against a backend on your own computer, put
  its address in `Assets/Resources/site.txt` (git-ignored), for example
  `http://localhost:8000`, and run **Advisor3D → Set Up Project** once. That moves every
  request, the chat's AI and voice included; on a headset add `adb reverse tcp:8000 tcp:8000`.

## Talking with Abe

The Basics form is tapped; the chat is spoken. Opening the chat starts a voice conversation:
Abe, at the top of the card, greets you and asks the open question out loud, his mouth
moving as he speaks, and you just answer. His words appear under him as he says them, and yours
once they are heard. Each answer fills the same profile the tapped and typed ones fill. **Stop Talking**
and **Talk to Abe**, at the top of the card, turn voice off and on. If voice can't start, Abe's
written opening lines appear and the chat works by tapping and typing, as on the site. It uses
OpenAI's Realtime API (`gpt-realtime-2.1`, voice `ash`). **Not yet tried with a real API key,
in the editor or on a headset.** The code compiles and the logic is tested, nothing more.

- `Voice.cs` sends the microphone to OpenAI over a WebSocket and plays what comes back.
  `Guide.cs` opens and closes Abe's mouth with the loudness of his voice.
- Abe leads the conversation himself (`VoiceScript.cs` holds his instructions, sent when
  voice connects): he asks in his own words, reacts to what he hears, takes several answers in
  one sentence or a correction to an earlier one, and never reads out an error.
- The app still owns the answers. After everything you say the model first reports what it
  heard through `save_answers`, in a silent text-only turn; the app checks each value with the
  chat script's own rules (`Script.Interpret`), saves what is good, and tells the model what was
  saved and what to find out next. Abe then speaks once. A youngest child over 30 is taken as
  grown, not turned away.
- The API key never ships in the APK. The app asks the backend, `POST /api/voice/session`
  (`apps/backend/voice.py`), for a secret that lasts a minute. The model and the voice are set there.
  Its own instructions and `record_answer` tool are a fallback the app replaces on connecting.
- You can talk over Abe. The headset has no echo cancellation, so while he speaks the app does
  not pass the microphone on (he would hear himself); it listens for a voice clearly louder
  than his own echo, held for about a quarter of a second, then stops him and sends what you
  said. If it stops him for a noise and nobody speaks, he asks his question again. The
  thresholds are at the top of `Voice.cs` and have not been tuned on a headset.
- Abe waits until you have clearly finished before he answers (`eagerness: low`), so a pause
  in the middle of a number does not cut you off.
- Voice hangs up after the closing words, when you leave the chat or take the headset off,
  and after ten minutes. Tapping, the number pad and typing all keep working while it is on,
  and are all that is left if voice can't start.

The app asks the deployed site for its session, so voice works once the site has an OpenAI
key: `apps/backend/README.md` says how Israel supplies it (a GitHub secret, then a deploy). Nothing
changes in the app or the APK.

To try voice without deploying, run the backend on your computer instead:

```sh
# from the repository root, with your own key
cd apps
OPENAI_API_KEY=sk-... python -m flask --app backend.app run --port 8000
# In a second terminal, from the repository root:
echo "http://localhost:8000/api/voice/session" > apps/advisor3d-unity/Assets/Resources/voice-endpoint.txt
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
backend; the deployed one always uses `DEFAULT_MODEL` in `apps/backend/voice.py`.

## How it maps to the site

The logic files are ports of the site's, and keep its order, so the two can be read side by side.

| Unity (`Assets/Scripts/`) | Site (`apps/web/src/`) |
| --- | --- |
| `Calculator.cs` | `domain/calculator.ts` |
| `Script.cs` | `intake/script.ts`, `guide/guide.ts` |
| `Backend.cs` | `intake/ai.ts` |
| `Store.cs` | `lib/store.ts` |
| `Guide.cs` | `guide/Avatar.tsx` |
| `Screens.cs` | nothing for the connect and handoff screens; `Home.tsx`, `intake/Prepare.tsx`, `intake/Chat.tsx`, `intake/Knows.tsx`, `intake/Review.tsx`, `results/Results.tsx` |
| `Voice.cs`, `VoiceScript.cs` | nothing: the site has no voice |
| `Pairing.cs`, `Sync.cs`, `Scanner.cs` | `intake/pair.ts`, `intake/Vr.tsx` (the other end of the pairing) |
| `Picture.cs` | `results/charts.tsx` (the year charts), as posts around the wearer |
| `Hands.cs` | nothing |
| `Ui.cs`, `App.cs`, `MeshGen.cs`, `Resources/Shaders/` | the headset UI kit and room (from `apps/advisor3d-web/src/xr/`) |

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
- Your hands are drawn as a faint, see-through glove (`Hands.cs`); a hand that holds a
  controller shows a faint closed glove. In passthrough you see your real hands.
- Results is the site's slide deck, with the charts built in the room (`Picture.cs` and
  the stacks) in place of the easel, and a look-ahead slide the site does not have. Abe's poses
  for each slide are not here, and neither is the site's what-if step for a child or rising prices.
- The handoff screen has no counterpart on the site: it is the way back to it.

## Tests

The calculator and the chat script have no Unity types, so they run without it:

```sh
dotnet run --project Tests~
```

These are the site's tests (`apps/web/tests/`) ported to C#, plus a run through the whole
scripted chat, what the voice model is told (`VoiceScript.cs`), and the pairing shapes (`Pairing.cs`).

## Not checked yet

- Pairing with a browser: the camera permission prompt, whether the passthrough cameras open
  as a webcam, and how close the QR code has to be. The reader itself finds the site's code in
  a 1280 by 960 picture where the code is under 90 pixels wide. Typing the code avoids the camera.
- Talking with Abe, end to end: it has never run against OpenAI. First things to check are the
  microphone permission prompt in the headset, whether Abe's audio is smooth, and whether
  closing the microphone while he speaks is enough to stop him hearing himself.
- The answer line in the chat: the headset keyboard opening, dictation, and the reply from the AI
  on the device (the same request works from a computer).
- Passthrough ("Show My Real Room"). It showed no camera view on the headset; the OpenXR
  composition layers feature it needs was off and is now on, but the fix has not been tried.
- The drawn hands (`Hands.cs`): the glove shape has only been checked by compiling.
- The ring and the results deck (`Picture.cs`): seen in the editor's screenshots, not in a headset.
- The live captions under Abe, and the number pad staying away while voice is on.
- Recentering (tap B or Y, or turn away from the panels) and starting over (hold B or Y, or
  leave the headset off for ten seconds). The thresholds are constants at the top of `App.cs`.
