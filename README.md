# EzyAi Helper

Developing the best sidekick linux app for your coding agent.

A local-first Linux desktop app + CLI that bundles the small, genuinely
useful pieces of a "sidekick" for an AI coding agent: a place to write a
skill once and hand it to every assistant you use, and a safe way for that
assistant to reach a remote box over SSH. Later phases add an AI-editable
office suite, a multi-agent orchestrator, and a research workbench — see
[docs/ROADMAP.md](docs/ROADMAP.md).

## Why these two first

Of the six projects this app draws inspiration from, these were the
smallest, most self-contained, and fastest to a real working app:

- **Skills Hub** — inspired by [jiweiyeah/Skills-Manager](https://github.com/jiweiyeah/Skills-Manager):
  write a skill once in a central store, then symlink it into whichever AI
  assistants (Claude Code, Codex, Cursor, Gemini CLI, …) should see it,
  instead of maintaining N copies.
- **SSH Ops** — inspired by [badseal/ssh-skill](https://github.com/badseal/ssh-skill):
  a safety-conscious wrapper around `ssh`/`scp` with a hard output cap, a
  timeout that reports `timeout` instead of silently failing, host-key
  verification left on, and destructive-command patterns refused unless
  explicitly confirmed.

Everything here is original code written against the *described behavior*
of those projects — Skills-Manager is Tauri/Rust and ssh-skill is a Python
CLI; this app reimplements the same ideas on Node/Electron so it runs with
the toolchain actually available on this machine (Rust/Cargo is not
installed here — see the roadmap for the plan to move to Tauri once it is).

## Run it

```sh
npm install
npm start        # launches the Electron app
node bin/ezyai.js skills list   # or use the CLI directly
```

## Layout

```
core/skills/    skills store + symlink sync logic (no Electron dependency)
core/ssh/       ssh/scp wrapper (no Electron dependency)
electron/       main process + preload (IPC bridge)
renderer/       the UI (Skills Hub tab, SSH Ops tab)
bin/ezyai.js    CLI: `ezyai skills ...`, `ezyai ssh ...`
```

`core/` has no Electron dependency on purpose — it's what the CLI and the
Electron app both call into, and what later phases (orchestrator, office
suite) will also depend on.

## Status

Phase 1 of 6. See [docs/ROADMAP.md](docs/ROADMAP.md) for what's next and
which source project each phase draws from.
