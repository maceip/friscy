## friscy launch checklist

This document tracks the remaining launch requirements for the friscy GitHub Pages demo and how we verify them end‑to‑end (via browser automation / Puppeteer‑style tests).

### 1. Header layout & branding

- **Top‑left logo**
  - Use `friscylogo.png` as the only visual brand element in the top‑left of the header.
  - Remove the literal text `friscy` from the header; the logo plus status line are sufficient.
- **Top‑right logos**
  - Show `mcp.svg` and `riscv-logo.svg` on the top‑right of the header.
  - Remove any previous header icons that these replace (e.g. legacy RISC‑V or WebMCP glyphs).

### 2. Suspend / resume control (replacing snapshot camera)

- **Control placement**
  - The snapshot/camera control must live in the **bottom‑right overlay of the terminal wrapper**, not in the main nav/header.
  - It should sit alongside the existing pause control in the small floating control strip.
- **Icon behavior**
  - Replace the camera glyph with `SUSPEND.svg` initially.
  - When clicked and the VM is successfully suspended, the button:
    - Becomes visually “inactive” (e.g. dimmed / disabled state).
    - Switches its icon to `RESUME.svg`.
  - When clicked in the resume state:
    - The VM resumes execution.
    - The button returns to the active state with the `SUSPEND.svg` icon.
- **Scope**
  - Suspend/resume must operate correctly for **all three terminals / examples**:
    - Alpine shell.
    - Node.js REPL.
    - Go echo server.

### 3. Network behavior (Go echo only)

- **Network policy**
  - The **Go echo server** terminal is the **only** guest that should have external network connectivity.
  - Alpine shell and Node.js REPL must not be able to reach external network targets beyond what the current sandbox/policy allows (no accidental open egress).
- **Verification**
  - Add a small scripted check that:
    - Starts the Go echo server (port 8080).
    - Sends at least one HTTP request against it from the browser side and validates the echoed response.
    - Optionally attempts the same pattern from Alpine / Node.js and verifies they cannot make external network calls where they shouldn’t.

### 4. Boot speed & suspend/resume responsiveness

- **Boot**
  - Alpine, Node.js, and Go server examples should boot quickly enough for an interactive demo:
    - Target: from “Preparing…” to a usable prompt or ready state in a small number of seconds on a typical desktop browser.
  - Any progress HUD or status text should reflect this clearly (no long stretches of ambiguous “Preparing…” with no feedback).
- **Suspend/resume**
  - Suspend operations should complete promptly and provide clear user feedback (status text and/or HUD).
  - Resume should return the terminal(s) to an interactive state without visible corruption or loss of prompt.

### 5. Automation / Puppeteer‑style verification

- **Goal**
  - A single automated browser test run (“Puppeteer green”) is the **verification gate** that all of the above requirements are satisfied on the deployed GitHub Pages site (`https://maceip.github.io/friscy/`).
- **Test flow (high‑level)**
  - Navigate to `https://maceip.github.io/friscy/`.
  - Wait for the main UI to reach a ready state (terminals visible, no blocking error banners).
  - **Header checks**
    - Assert top‑left shows `friscylogo.png` (by selector/alt text or `src`).
    - Assert there is no visible “FRISCY” text label in the header.
    - Assert top‑right shows `mcp.svg` and `riscv-logo.svg`.
  - **Suspend/resume control**
    - Locate the bottom‑right terminal overlay strip.
    - Assert:
      - Pause button is present.
      - Suspend button is present with `SUSPEND.svg`.
    - Click suspend:
      - Assert it visually deactivates and its icon changes to `RESUME.svg`.
    - Click resume:
      - Assert it reactivates and returns to `SUSPEND.svg`.
  - **Terminal behavior**
    - For Alpine, Node.js, and Go:
      - Send a simple command (e.g. `echo friscy` / minimal Go request) and assert expected output appears.
      - Exercise suspend/resume around an active session and ensure the terminal continues to function.
  - **Network behavior**
    - From the browser side, send an HTTP request to the Go echo server on port 8080 and verify echo semantics.
    - Optionally assert that Alpine/Node.js cannot perform equivalent external network requests (according to current policy).
- **Output**
  - The test should exit with a clear PASS/FAIL (green/red) status.
  - A “green” run on the live GitHub Pages URL is the final sign‑off for this launch checklist.

### 6. Implementation status (initial)

- **Captured here**: requirements and verification plan based on the recent conversation.
- **Next steps (implementation)**:
  - Wire the new suspend/resume button behavior (icon swap + disabled/active visual state + VM control) for all three terminals.
  - Ensure only the Go echo path has the intended network connectivity, and add the verification script.
  - Implement the Puppeteer (or equivalent browser automation) test that follows the flow described above.
  - Run the test against `https://maceip.github.io/friscy/` and iterate until the run is green.

