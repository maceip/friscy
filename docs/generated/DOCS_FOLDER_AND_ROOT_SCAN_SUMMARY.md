# Docs Folder File-by-File Summary (Claim-Aware)

This report summarizes every file under `docs/` and labels trust level:
- `verified-evidence`: mostly factual structure/asset or machine-generated metadata
- `historical-log`: records what happened in runs; useful but not guaranteed current
- `design-claim`: intended architecture/process; must be cross-checked against code/runtime

## `docs/ARCHITECTURE.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Code map + invariants for runtime, syscalls, VFS, networking, and JIT integration boundaries.
- Key points:
  - # friscy Architecture
  - ## Overview
  - ## Runtime Architecture
  - ## Memory Model

## `docs/BUILD.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Build/run instructions for native, wasm, aot, jit, and packaging workflows.
- Key points:
  - # Building friscy — 31-bit Arena Environment
  - ## Prerequisites
  - ## Quick Start
  - ## Build Tuples

## `docs/DESIGN.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: High-level design philosophy and core technical approach.
- Key points:
  - # Design Philosophy
  - ## Principles
  - ## Architecture Decision Records
  - ## Related

## `docs/ENDZIEL.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Long-form target vision and acceptance-oriented milestone framing.
- Key points:
  - # The Ultimate Goal
  - ## Tier 1: Actually Possible (High Impact)
  - ### 1. RISC-V → Wasm AOT Compilation
  - # RISC-V assembly

## `docs/FRONTEND.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Browser shell, terminal, worker message flow, and UI/runtime interactions.
- Key points:
  - # Frontend & UI
  - ## Browser Runtime (`friscy-bundle/`)
  - ### Terminal
  - ### Networking

## `docs/OPTIMIZATION-RAILS.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Optimization strategy, especially Tier1/Tier2 flow and gating expectations.
- Key points:
  - # Optimization Rails — Making Everything We Built Actually Usable
  - ## Current State Audit
  - ## What to Wire Up
  - ### 1. Add LLRT tab to friscy-bundle

## `docs/PLANS.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Near/medium/long-term roadmap and currently prioritized work.
- Key points:
  - # Plans & Roadmap
  - ## Current Focus
  - ## Near-term
  - ## Medium-term

## `docs/PRODUCT_SENSE.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Product framing and usability priorities.
- Key points:
  - # Product Sense
  - ## Who is friscy for?
  - ## Product Principles
  - ## Competitive Positioning

## `docs/QUALITY_SCORE.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Quality status rubric and scoring signals.
- Key points:
  - # Quality Score
  - ## Rubric
  - ## Metrics (future)
  - ## SLOs (aspirational)

## `docs/RELIABILITY.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Reliability guarantees, failure modes, and operational expectations.
- Key points:
  - # Reliability
  - ## Syscall Coverage
  - ### Coverage by category
  - ### Stub policy

## `docs/ROADMAP.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Expanded roadmap narrative and sequencing.
- Key points:
  - # friscy: Docker → Browser Runtime Roadmap
  - ## Vision
  - ## Project Status Overview
  - ## Completed: VFS & Syscall Completion

## `docs/RUN-JOURNAL.md`
- Kind: run journal
- Trust: historical-log
- Summary: Chronological execution record of attempts, results, and pivots.
- Key points:
  - # Run Journal
  - ## 2026-02-23
  - ## 2026-02-23T16:36:14.033Z Node crypto + deep checkpoints
  - ## 2026-02-23T16:37Z Export/continuity fixes

## `docs/RUNNING.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Runtime invocation patterns (native/browser), flags, and operational gotchas.
- Key points:
  - # Running friscy — Native, Browser, and Node.js
  - ## Native Emulator
  - ### Basic usage
  - ### Important: argument passing

## `docs/SECURITY.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Threat model, trust boundaries, and security recommendations.
- Key points:
  - # Security
  - ## Threat Model
  - ### Trust boundaries
  - ### Sandbox Properties

## `docs/WORKSTREAMS.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Parallelized implementation workstreams with validation criteria.
- Key points:
  - # friscy: Parallel Workstreams
  - ## Goal
  - ## Dependency Graph
  - ## WORKSTREAM A: Native Runtime Validation

## `docs/design-docs/005-checkpoint-linear-transplant.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: ADR for checkpoint format and restore mechanics.
- Key points:
  - # ADR 005: Checkpoint as Linear Memory Transplant
  - ## Context
  - ## Decision
  - ## Consequences

## `docs/design-docs/index.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Index pointer document linking spec/ADR content.
- Key points:
  - # Design Docs — ADR Log
  - ## How to add a new ADR

## `docs/exec-plans/active/.gitkeep`
- Kind: placeholder
- Trust: verified-evidence
- Summary: Placeholder/auxiliary file.
- Key points:
  - size: 0 bytes
  - Used to keep directory structure in git.

## `docs/exec-plans/completed/workstream-a.md`
- Kind: completed plan
- Trust: historical-log
- Summary: Completed Workstream A summary and outcomes.
- Key points:
  - # ExecPlan: Workstream A — Native Runtime Validation
  - ## Progress
  - ## Surprises & Discoveries
  - ## Decision Log

## `docs/exec-plans/completed/workstream-b.md`
- Kind: completed plan
- Trust: historical-log
- Summary: Completed Workstream B summary and outcomes.
- Key points:
  - # ExecPlan: Workstream B — Emscripten/Wasm Build + Browser Execution
  - ## Progress
  - ## Surprises & Discoveries
  - ## Decision Log

## `docs/exec-plans/completed/workstream-c.md`
- Kind: completed plan
- Trust: historical-log
- Summary: Completed Workstream C summary and outcomes.
- Key points:
  - # ExecPlan: Workstream C — AOT Compiler (rv2wasm)
  - ## Progress
  - ## Surprises & Discoveries
  - ## Decision Log

## `docs/exec-plans/completed/workstream-d.md`
- Kind: completed plan
- Trust: historical-log
- Summary: Completed Workstream D summary and outcomes.
- Key points:
  - # ExecPlan: Workstream D — Interactive Terminal
  - ## Progress
  - ## Surprises & Discoveries
  - ## Decision Log

## `docs/exec-plans/completed/workstream-ef.md`
- Kind: completed plan
- Trust: historical-log
- Summary: Completed Workstream E/F summary and outcomes.
- Key points:
  - # ExecPlan: Workstream E+F — Wizer Snapshots + VFS Tar Export
  - ## Progress
  - ## Surprises & Discoveries
  - ## Decision Log

## `docs/exec-plans/tech-debt-tracker.md`
- Kind: planning
- Trust: design-claim
- Summary: Outstanding debt list and prioritization notes.
- Key points:
  - # Tech Debt Tracker
  - ## Process

## `docs/file-icons--alpine-linux.svg`
- Kind: asset
- Trust: verified-evidence
- Summary: SVG asset used by docs; not an execution/architecture authority.
- Key points:
  - Visual asset only.
  - No implementation or validation semantics.

## `docs/generated/.gitkeep`
- Kind: placeholder
- Trust: verified-evidence
- Summary: Placeholder/auxiliary file.
- Key points:
  - size: 0 bytes
  - Used to keep directory structure in git.

## `docs/generated/GOLDEN_DEMO_EXECUTION_COMMITMENT.md`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated commitment log mapping requested work to acceptance gates.
- Key points:
  - # Golden Demo Execution Commitment (2026-02-23)
  - ## User-requested work (committed)
  - ## Acceptance gates

## `docs/generated/GOLDEN_DEMO_EXECUTION_PLAN.md`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated execution plan and current priorities.
- Key points:
  - # Golden Demo Execution Plan (2026-02-23)
  - ## Objective
  - ## Completed
  - ## Active Priorities

## `docs/generated/GOLDEN_DEMO_MATRIX_REPORT.md`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated matrix report of demo pass/fail status and evidence notes.
- Key points:
  - # Golden Demo Matrix Report
  - ## Result
  - ## Evidence Notes
  - ## Remaining Gaps

## `docs/generated/GOLDEN_DEMO_ROOTFS_PROVENANCE.md`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated artifact provenance (hashes + creation commands).
- Key points:
  - # Golden Demo Rootfs Provenance (2026-02-23)
  - ## Asset Hashes
  - ## Alpine Demo Rootfs (`docs_site/rootfs.tar`)
  - ## Node Demo Rootfs (`docs_site/nodejs.tar`)

## `docs/generated/GOLDEN_DEMO_WORK_QUEUE.md`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated task queue/progress tracker for demo execution.
- Key points:
  - # Golden Demo Work Queue
  - ## 2026-02-23 (Eject Mode)

## `docs/generated/TEST-SPEC-BENCH-GATES-3-4-5.md`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated test specification with scope, assertions, and pass criteria.
- Key points:
  - # Spec/Bench Gate Template: #3 #4 #5
  - ## Shared anti-fake rules (all three)
  - ## #3 Stream rootfs into Worker
  - ### A/B toggle

## `docs/generated/TEST-SPEC-BENCH-JIT-PREWARM-IMPACT.md`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated test specification with scope, assertions, and pass criteria.
- Key points:
  - # Benchmark Gate: #2 JIT Prewarm Impact
  - ## Goal
  - ## Harness
  - ## A/B Modes

## `docs/generated/TEST-SPEC-BENCH-MAIN-PATH-JIT-IMPACT.md`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated test specification with scope, assertions, and pass criteria.
- Key points:
  - # Benchmark Gate: #1 Main-Path JIT Activation Impact
  - ## Goal
  - ## Harness
  - ## A/B Modes

## `docs/generated/TEST-SPEC-JIT-PREWARM-RELIABILITY.md`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated test specification with scope, assertions, and pass criteria.
- Key points:
  - # Test Spec: #2 Boot JIT Prewarm Reliability
  - ## Objective
  - ## Scope
  - ## Assertions

## `docs/generated/TEST-SPEC-MAIN-PATH-JIT-ACTIVATION.md`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated test specification with scope, assertions, and pass criteria.
- Key points:
  - # Test Spec: Main-Path JIT Activation (#1)
  - ## Scope
  - ## Test workload
  - ## Pass criteria

## `docs/generated/alpine_checkpoint_ladder_report.json`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated run artifact capturing automation results, timings, and checkpoint metadata.
- Key points:
  - Top-level keys: at, example, ok, timings, checkpoints, error, termTail
  - ok: true
  - error: null
  - timing fields: boot0Ms, action0Ms, export1Ms, boot1Ms, action1Ms, export2Ms, boot2Ms, action2Ms
  - checkpoint fields: stage1, stage2

## `docs/generated/docs_site_quick_probe.json`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated run artifact capturing automation results, timings, and checkpoint metadata.
- Key points:
  - Top-level keys: alpine, nodejs, server

## `docs/generated/docs_site_unified_rootfs_probe.json`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated run artifact capturing automation results, timings, and checkpoint metadata.
- Key points:
  - Top-level keys: alpine, fatal

## `docs/generated/golden_demo_checkpoint_ladders_report.json`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated run artifact capturing automation results, timings, and checkpoint metadata.
- Key points:
  - Top-level keys: at, baseUrl, bootTimeoutMs, cmdTimeoutMs, results, passCount, total
  - counts: passCount=0, total=1

## `docs/generated/node_chain_direct_report.json`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated run artifact capturing automation results, timings, and checkpoint metadata.
- Key points:
  - Top-level keys: ok, steps, timings, checkpoints, error, tail
  - ok: false
  - error: command timeout: claude mcp list
  - timing fields: bootBaseMs
  - checkpoint fields: (none)

## `docs/generated/node_claude_checkpoint_chain_report.json`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated run artifact capturing automation results, timings, and checkpoint metadata.
- Key points:
  - Top-level keys: ok, port, startedAt, checkpoints, timings, steps, error, logTail, mcpPreview, finishedAt
  - ok: false
  - error: claude mcp list did not complete
  - timing fields: bootBaseMs, mcpListMs
  - checkpoint fields: (none)

## `docs/generated/node_deep_checkpoint_report.json`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated run artifact capturing automation results, timings, and checkpoint metadata.
- Key points:
  - Top-level keys: at, url, metrics, checkpoints, expectedSha, finalStatus, termTail
  - checkpoint fields: deep1, deep2

## `docs/generated/node_unified_crash_trace.json`
- Kind: generated artifact
- Trust: historical-log
- Summary: Generated run artifact capturing automation results, timings, and checkpoint metadata.
- Key points:
  - Top-level keys: hashOk, termTail, logTail

## `docs/launch.md`
- Kind: launch checklist
- Trust: design-claim
- Summary: Launch requirements checklist for docs/demo outcomes and validation.
- Key points:
  - # Launch Checklists & Tasks
  - ## Current UI & Fix Tasks

## `docs/product-specs/index.md`
- Kind: design/spec doc
- Trust: design-claim
- Summary: Index pointer document linking spec/ADR content.
- Key points:
  - # Product Specs — Index
  - ## How to add a spec

## `docs/references/.gitkeep`
- Kind: placeholder
- Trust: verified-evidence
- Summary: Placeholder/auxiliary file.
- Key points:
  - size: 0 bytes
  - Used to keep directory structure in git.

## `docs/references/lineartransplant.md`
- Kind: reference
- Trust: design-claim
- Summary: Reference explaining memory transplant model and friscy adaptation.
- Key points:
  - # Linear Memory Transplant — Reference and friscy Implementation
  - ## Reference: Raw Memory Transplant (lineartransplant)
  - ## friscy's Checkpoint: Extended Transplant
  - ### Binary Format (FRISCYCK v2)

# Root Markdown/Text Scan — Actionable Insights

These are insights relevant to current Node checkpoint/Tier workflow.

## `./AGENTS.md`
- Heading: # friscy
- Insight: Execution conventions/build constraints for this environment; procedural guardrails.
- Signals: Node/Claude demo notes, network path notes

## `./ARCHITECTURE.md`
- Heading: # Architecture
- Insight: Strong source for invariants and subsystem boundaries; good for verifying intended runtime behavior.
- Signals: network path notes

## `./DEMO.md`
- Heading: # friscy Web Demo
- Insight: Describes older demo stack including WebTransport-centric path; treat as potentially stale.
- Signals: checkpoint flow notes, Node/Claude demo notes, network path notes

## `./PERFORMANCE-ACCELERATION-PLAN.md`
- Heading: # Performance Acceleration Evolution: Implementation Guide
- Insight: Large optimization backlog/history; useful for ideas, but validate status claims before execution.
- Signals: checkpoint flow notes, Node/Claude demo notes, network path notes

## `./README.md`
- Heading: ## Milestone: Claude Code in the Browser
- Insight: Contains baseline commands and checkpoint examples; useful as operational reference but may lag current demo reality.
- Signals: checkpoint flow notes, Node/Claude demo notes, network path notes

## `./RESEARCH-emulation-acceleration.md`
- Heading: # Emulation Acceleration Research: Techniques Applicable to fRISCy
- Insight: Research-driven optimization ideas; strategic input rather than immediate source of truth.
- Signals: tier/stage mode notes, Node/Claude demo notes

## `./SYSCALL_TODO.md`
- Heading: # Syscall Coverage Report
- Insight: States syscall coverage completion; useful confidence signal, still verify against failing workloads.
- Signals: Node/Claude demo notes

## `./WORK.md`
- Heading: (no heading)
- Insight: Product brainstorming notes; low authority for runtime implementation decisions.
- Signals: Node/Claude demo notes

## `./aeon_runtime.txt`
- Heading: (no heading)
- Insight: Index-like runtime file listing; low standalone semantic value.
- Signals: checkpoint flow notes, preload/hypercall notes, Node/Claude demo notes

## `./alpha_test.md`
- Heading: # Alpha Checkpoint Test Results
- Insight: Historical evidence of prior checkpoint/browser behavior and known caveats.
- Signals: checkpoint flow notes, Node/Claude demo notes, network path notes

## `./launch.md`
- Heading: ## friscy launch checklist
- Insight: Concise launch checklist and acceptance framing; high-value for demo definition of done.
- Signals: Node/Claude demo notes

## `./lineartransplant.md`
- Heading: (no heading)
- Insight: Reference model for checkpoint transplant approach; aligns with checkpoint ADR.
- Signals: none detected

## `./standalone_runtime.txt`
- Heading: (no heading)
- Insight: Index-like runtime file listing; low standalone semantic value.
- Signals: checkpoint flow notes, preload/hypercall notes, Node/Claude demo notes
