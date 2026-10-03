# Hackathon Team Agent Guide

For humans and AI agents building under a hackathon deadline. Ship a demo people can understand, keep teammates moving, and use these guidelines with judgment. Keep coordination lightweight.

## Build for the demo

- Skim the README and relevant repo guidance, then get building.
- Agree on the one thing the demo should prove. Get a tiny end-to-end version running early, then improve it.
- Prefer familiar tools, simple code, and useful shortcuts. Save architecture rewrites and extra features for after the core flow works.
- Make reversible decisions yourself. Ask when a choice changes someone else's work or the team's demo plan.
- If a feature threatens the deadline, shrink it, mock the missing dependency, or park it. Be clear about what is mocked.

## Coordinate before coding

- Drop a quick note in the team's shared channel: **“I'm building X, touching Y, and need Z.”** No formal task board required.
- Agree on the API or data shape where features connect; a sample JSON object is often enough. Flag overlapping edits, especially shared config and lockfiles.
- Surface blockers early. Share what you need, switch to independent work, and let teammates know when your piece is ready.

## Check first, then build

- Before starting a task, editing files, or changing Git state, inspect the current workspace and fetch remote updates:

  ```sh
  git status --short --branch
  git branch --show-current
  git diff
  git diff --cached
  git fetch origin
  git status --short --branch
  ```

- Review untracked files too; they may be another agent's unfinished work. Check incoming commits and changes to files you plan to touch when an upstream branch exists.
- Fetch updates remote references; it does not update your working files. Don't automatically pull, rebase, or reset after fetching. Integrate deliberately in your own worktree once existing work is safe.
- If fetching fails, say so and avoid assuming your branch is current. You can continue isolated local work; retry before integration.
- Repeat the status and relevant diff checks before commits, branch changes, or integration; fetch again before pushing or merging. Re-read a file immediately before editing it so stale context doesn't replace newer work.

## Avoid stepping on each other

- Use short-lived feature branches, such as `feat/demo-map` or `fix/upload`.
- Give simultaneous agents separate worktrees or clones. Different branches in one shared folder don't isolate their edits.
- Claim overlapping files briefly in the shared channel. If another agent is editing a file, coordinate a handoff or pick independent work. Separate worktrees still need coordination when merging.
- Preserve changes you didn't make, including staged and untracked work. Make targeted edits; don't replace whole files from an old copy or remove unfamiliar code or tests to get a check passing.
- Don't use `git reset --hard`, `git clean`, forced checkout/switch, file-discarding `git checkout`/`git restore`, or force pushes to resolve a dirty tree or conflict. Don't delete branches or worktrees containing unmerged work. Any intentional discard needs explicit authorization from the owner of that work and a recoverable backup, including untracked files.
- Don't switch branches or stash/pop someone else's changes in a shared workspace. Use your own worktree instead.
- Stage only your task's files or hunks, inspect the staged diff, and commit in useful chunks. Avoid blanket `git add .` or `git add -A` when others' changes are present.
- Resolve conflicts by understanding both changes and preserving their intent. Don't blindly choose “ours” or “theirs”; involve the other owner when the intended behavior is unclear.

## Merge early with PRs

**Prefer pull requests to merge into `main`.** Small PRs and quick teammate reviews catch integration surprises without slowing the hackathon down.

1. Open a PR as soon as there's a useful slice to integrate; use a draft to share work in progress.
2. Say what works, how you checked it, and anything teammates need to know. Add a screenshot if it helps.
3. Get a quick review when a teammate is available. Resolve conflicts with the owner of overlapping work.
4. Check the affected flow against current `main`, merge, and tell anyone waiting on it. Squash merge is a handy default.

Integrate throughout the event. Don't leave every branch until the final hour. Keep `main` demoable, and merge dependencies before features that need them. Avoid extra approval gates unless the team needs them.

### PR description template

```markdown
Works: <what the demo can do now>
Checked: <commands or manual steps and results>
Heads-up: <dependencies, setup changes, mocks, or remaining gaps>
```

## Unblock fast, check what matters

- Run the relevant existing checks and try the user flow you changed. Add tests where they catch meaningful failures; keep effort proportional to the change.
- Timebox stubborn bugs. Share the error and what you've tried, then simplify, try a fallback, or ask a teammate for a fresh look.
- For flaky APIs, rate limits, or missing credentials, use fixtures or a fallback mode so the team can keep building. Label demo data and mocks honestly.
- Keep secrets out of commits. Put required variable names and placeholder values in an example env file.
- Leave a short handoff with the PR, what works, setup changes, and known gaps. Report checks honestly, including anything you couldn't run.

## Survive the final hour

- Leave time to rehearse, deploy, and submit. Near the deadline, prioritize broken demo steps over new features.
- Have someone run the whole demo on the actual presentation device or deployed app. Check it from a fresh checkout if time allows.
- Keep setup and demo steps in the README so “works on my machine” doesn't block the team.
- Prepare predictable demo data and a backup recording or screenshots if the network fails.
- Check the submission requirements early: repo access, project description, links, video, and deadline. Make sure someone owns the final submission.
