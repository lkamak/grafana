---
name: glk-feature-review
description: Guides post-implementation review for GLK Jira work on the lkamak/grafana fork, including /review-bugbot, version-history visual diff risk checks, and targeted tests. Use after implementing or planning GLK tickets (e.g. GLK-4), when the user runs /review-bugbot, or when reviewing dashboard-scene version history changes.
---

# GLK feature review (lkamak/grafana)

## Scope

Use for **review and validation** of GLK queue work in this fork—not for initial implementation unless the user asks you to fix findings.

For GitHub/Jira targeting, follow [github-lkamak-fork](../github-lkamak-fork/SKILL.md). For assigned-ticket lookup, use the personal `my-assigned-jira-issues` skill when present.

## Review workflow

1. **Confirm diff scope** — On the branch under review (often `cursor/*-1a3c`). Default review is `branch changes` vs `main`.
2. **Run Bugbot** — When the user says `/review-bugbot`, follow the `review-bugbot` skill: launch one `bugbot` subagent with `Full Repository Path: /workspace` (or the repo root) and `Diff: branch changes`, unless they asked for uncommitted changes only.
3. **Do not fix by default** — Report Bugbot findings in the required table; only implement fixes if the user asks next.
4. **Cross-check domain risks** — After Bugbot (or when reviewing without Bugbot), walk [reference.md](reference.md) **Visual version diff** checklist if the diff touches `version-history/`.
5. **Run targeted tests** — Use the test commands in reference.md for the touched area; prefer `yarn jest --no-watch` (never leave Jest in watch mode).
6. **Manual UI (when visual)** — Dashboard → Settings → Versions → select two versions → Compare. Exercise tabs, moved panels (ghost outline), detail drawer, restore, and collapsed JSON diff. Record a demo video when the change is UI-facing and the environment can run Grafana.

## Bugbot output format

Present findings exactly as the review-bugbot skill specifies:

| Severity | Location (file:line) | Finding |

Sort by severity (highest first). If no issues: **Bugbot found no bugs**.

## GLK-4 acceptance (visual dashboard version diff)

When reviewing GLK-4 or similar PRs, confirm:

- Two versions from history open compare; visual canvas appears **above** existing field diff and JSON diff.
- Panels show added / removed / changed / moved / unchanged; layout moves are visible (not JSON-only).
- Changed panel drawer explains title, query, viz type, thresholds in readable form.
- Tabbed dashboards: **one tab at a time** via tab picker—no flattened overlap across tabs.
- Restore and JSON diff remain usable and unchanged in behavior.

## Trade-offs to mention in review

- Panel identity is keyed by **panel id** across versions; renumbered panels can misclassify even when titles match.
- v2 tabs correlated by layout-path index (`tab-0`, …) can mis-associate panels if tab order changes between versions—flag if Bugbot or tests do not cover a fix.

## Additional resources

- Risk areas, file map, and test commands: [reference.md](reference.md)
