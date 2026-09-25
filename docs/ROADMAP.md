# Roadmap

Six phases, each drawing from one of the source projects this app is
inspired by. Phase 1 is built; the rest are scoped but not started.

## Status

| Phase | Shipped | Still missing |
|---|---|---|
| 1 Skills + SSH | complete | — |
| 2 Office | `core/office`: hunk-level edits for Markdown/HTML/text; `.docx` paragraph edits written as real Word tracked changes (needs `jszip`) | xlsx/pptx/PDF engines, docx paragraph add/remove, tables, formatting-aware edits |
| 3 Orchestrator | `core/agents`: Commander, 5 specialists, validated parallel plans, Goals tab | agent marketplace, external CLI agents, local KB/embeddings |
| 4 Research | `core/research`: run history, search, archive, sha256 provenance, markdown export | notebooks, literature/PDF pipeline, split-pane UI |
| 5 Goal agent | `core/goals`: folder-bound file writes with one-step undo | background/scheduled runs, voice |
| 6 Marketplace | `core/marketplace`: https registry, sha256-verified skill install | UI, agent packages, signing |

Everything above is unit-tested with `node --test` except the Electron UI and
live-model calls, which need a real display and model endpoint.

## Phase 1 — Skills Hub + SSH Ops (done)

- Central skill store + symlink sync into Claude Code / Codex / Cursor /
  Gemini CLI, inspired by [Skills-Manager](https://github.com/jiweiyeah/Skills-Manager).
- Safety-conscious `ssh`/`scp` wrapper, inspired by [ssh-skill](https://github.com/badseal/ssh-skill).
- Electron + Node, chosen over Tauri because Rust/Cargo isn't installed on
  the build machine this was scaffolded on. `core/skills` and `core/ssh`
  have no Electron dependency, so a later move to a Tauri shell only means
  rewriting `electron/` and `renderer/`, not the logic.

## Phase 2 — Office suite core

Inspired by [genoffice](https://github.com/genspark-ai/genoffice): local,
byte-preserving AI editing of real Docs/Sheets/Slides/PDF files, changes
surfaced as reviewable tracked revisions rather than full rewrites. Needs a
spreadsheet engine (calamine/IronCalc-equivalent) and a PDF content-stream
editor (PDFium); this is the largest single phase.

## Phase 3 — Multi-agent orchestrator core

Inspired by [Orkas](https://github.com/Orkas-AI/Orkas): a "Commander" that
breaks a goal into tasks and dispatches specialist agents (research,
writing, coding, office-file editing, SEO) in parallel or sequence, with a
local SQLite+embeddings knowledge base. This becomes the backbone Phase 2
and Phase 4's agents plug into.

## Phase 4 — Research workbench

Inspired by [open-science](https://github.com/ai4s-research/open-science):
explore → survey → experiment → write workflows with full artifact
provenance (figures/tables linked back to the code and data that produced
them), notebook (`.ipynb`) execution, and a searchable run history.

## Phase 5 — Goal-driven agent + voice ("Orbit")

Inspired by the *described* behavior of skales — that repository ships only
docs/releases for a closed-source product, so this is original design, not
a port: a `/goal ...` command that runs autonomously in the background with
inline diffs and one-click undo, plus an optional voice interface.

## Phase 6 — Skill/agent marketplace + external CLI bridges

Browse and install community skills and specialist agents (extending Phase
1's sync model), and bridge to external CLI agents (Claude Code, etc.) the
way Orkas does, so this app can dispatch to them rather than only its own
agents.
