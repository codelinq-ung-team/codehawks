// App state for one run of the app, in the same shape as the WebXR store
// (advisor3d/src/lib/store.ts). Nothing is saved to disk: like a new browser tab,
// a fresh launch starts fresh.
using System;
using System.Collections.Generic;

namespace Advisor3D
{
    // Answers from the short form before the chat. null means not answered yet (never zero).
    public class Form
    {
        public long? age, income, dependents, debt;
        public string marital; // "single" | "married"
        public bool? coverage;
    }

    public class Message
    {
        public string role; // "bot" | "user"
        public string text;
        public List<string> replies;
        public bool why, done;
    }

    public class AppState
    {
        public Profile profile = Calc.EmptyProfile();
        public Form form = new Form();
        public List<Message> messages = new List<Message>();
        public long? pending; // a monthly amount waiting for "yes, monthly" or "no, yearly"
        public bool started, typing;
        public bool offline; // true after an answer couldn't reach the AI and the script read it instead
    }

    public static class Store
    {
        // The app opens on "connect", looking for a browser to pair with; "home" is the headset on its own.
        // "handoff" is the last screen: the way back to the site, where the summary can be copied.
        public static readonly string[] ROUTES = { "connect", "home", "prepare", "chat", "review", "results", "handoff" };

        public static AppState State { get; private set; } = new AppState();
        public static string Route { get; private set; } = "connect";
        public static event Action Changed;
        public static event Action RouteChanged;

        // Change the state in place, then tell the screens.
        public static void Set(Action<AppState> change)
        {
            change(State);
            Changed?.Invoke();
        }

        public static void SetField(string id, Field field) => Set(s => s.profile[id] = field);

        public static void Reset()
        {
            State = new AppState();
            Changed?.Invoke();
        }

        // Take over with answers that came from somewhere else: a browser paired with the headset (Sync.cs).
        public static void Load(AppState state)
        {
            State = state;
            Changed?.Invoke();
        }

        public static void Go(string route)
        {
            Route = Array.IndexOf(ROUTES, route) >= 0 ? route : "connect";
            RouteChanged?.Invoke();
        }

        // A made-up household for demos ("See a sample family" on Home).
        public static void LoadSample()
        {
            static Field V(long value) => Field.Of(Status.Confirmed, value);
            State = new AppState
            {
                started = true,
                form = new Form { age = 34, income = 85000, marital = "married", dependents = 2, debt = 280000, coverage = true },
                profile = new Profile
                {
                    ["household"] = Field.Of(Status.Confirmed, "both"), ["youngestAge"] = V(4), ["income"] = V(85000),
                    ["support"] = V(60000), ["years"] = V(18), ["mortgage"] = V(240000), ["otherDebts"] = V(40000),
                    ["finalExpenses"] = V(12000), ["education"] = V(50000), ["existing"] = V(150000), ["savings"] = V(60000),
                    // Looking ahead: a bigger home, and a raise.
                    ["plans"] = V(2), ["futureIncome"] = V(120000),
                },
            };
            Changed?.Invoke();
        }

        // Start again without listeners from an earlier run (the editor keeps statics between plays).
        public static void Restart()
        {
            State = new AppState();
            Route = "connect";
            Changed = null;
            RouteChanged = null;
        }
    }
}
