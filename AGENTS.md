# friscy Knowledge Base — Table of Contents

This file is the entry point.  It tells you (or an LLM agent) **where to look**
for every category of project knowledge.  It does not duplicate content — each
link leads to a dedicated document that owns its topic.

## Architecture & Code

| Document | What it covers |
|----------|---------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, component status, data flow, file structure |
| [docs/DESIGN.md](docs/DESIGN.md) | Design philosophy — userland emulation, libriscv, Emscripten |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Browser UI, xterm.js terminal, friscy-bundle |
| [docs/SECURITY.md](docs/SECURITY.md) | Wasm sandbox model, network proxy trust boundaries |
| [docs/RELIABILITY.md](docs/RELIABILITY.md) | Syscall coverage guarantees, crash handling, VFS durability |

## Product

| Document | What it covers |
|----------|---------------|
| [docs/PRODUCT_SENSE.md](docs/PRODUCT_SENSE.md) | Target users, jobs-to-be-done, competitive positioning |
| [docs/product-specs/index.md](docs/product-specs/index.md) | Feature specs index |
| [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md) | Quality rubric, metrics, current vs target scores |

## Design Decisions

| Document | What it covers |
|----------|---------------|
| [docs/design-docs/index.md](docs/design-docs/index.md) | ADR log (index of all design docs) |

## Planning & Execution

| Document | What it covers |
|----------|---------------|
| [docs/PLANS.md](docs/PLANS.md) | Roadmap, milestones, current focus |
| [docs/exec-plans/active/](docs/exec-plans/active/) | In-flight execution plans |
| [docs/exec-plans/completed/](docs/exec-plans/completed/) | Archived plans |
| [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) | Known tech debt with priority |

## Generated & Reference

| Document | What it covers |
|----------|---------------|
| [docs/generated/](docs/generated/) | Auto-generated documentation (empty — future use) |
| [docs/references/](docs/references/) | Third-party LLM-friendly reference files |

## Existing Documentation

| Document | What it covers |
|----------|---------------|
| [docs/ENDZIEL.md](docs/ENDZIEL.md) | Advanced optimization strategies, performance tiers |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Detailed implementation status and TODOs |
| [docs/WORKSTREAMS.md](docs/WORKSTREAMS.md) | Parallel workstream organization and validation |

## Maintenance

The knowledge base is validated by CI:

- **`.github/workflows/docs-lint.yml`** — checks structure, cross-links, and
  freshness on every PR.
- **`scripts/doc-gardening.sh`** — agent that scans for stale docs and opens
  fix-up issues.  Runs weekly via `.github/workflows/doc-gardening.yml`.
