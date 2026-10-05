# Hyprland compositor-owned Hide design



## Keep the approved behavior, replace the failing mechanism


Choose **Window → Hide** to remove Television from the visible desktop while keeping its original window, document and live connection. Open Television from the launcher to bring that same window back to its original workspace and focus it. Other desktops retain native Minimize.


The current Electron Hide path destroys and recreates the Wayland shell role. The recorded Wayland restore failure remains open. The investigation found that moving a null-buffer commit earlier has no established way to free the older renderer-held image; a source ordering change is therefore not an accepted fix.


## Proposed application architecture


Add a small Hyprland window adapter, used only for a verified Hyprland session. On Hide, it moves the exact Television window to its own inactive named special workspace without following it. On launcher restore, it moves that window back to the recorded original workspace and focuses it. Electron's window and renderer remain alive throughout; this path does not call Electron Hide. The installed engine pin stays unchanged.


Use the verified API for the installed Hyprland version; this host has 0.56.2. The official Lua API supports special-workspace movement, including movement without following the window. Older command support must earn separate version-specific tests. An unknown or unavailable compositor API does not trigger the known failing Electron Hide fallback. [Official special-workspace example](https://wiki.hypr.land/configuring/code-snippets/); [official control API](https://wiki.hypr.land/configuring/core/advanced-configuration/using-hyprctl/).


## Required behavior and ownership



- Bind the adapter to the exact live main window using its process, compositor identity and a per-window ownership marker. Validate ownership inside the compositor action. An ambiguous, destroyed or replaced window must never select another application or another Television profile.

- Serialize Hide/restore requests. Repeated Hide is harmless. A launcher request arriving during startup or Hide records the desired final visible state; a late ready callback cannot reveal a window the user asked to hide.

- Hide preserves the normal, floating and maximized window states supported by acceptance. Fullscreen and grouped windows need explicit compatibility checks; unsupported states leave the window visible with a clear explanation.

- Restore targets the original workspace. If that workspace no longer exists, use the currently active normal workspace after validating it. A special workspace already visible on any monitor cannot be used as the hidden destination; select a fresh owned inactive destination or leave the window visible.

- A manual move out of the owned hidden workspace, or a manual reveal of that workspace, cancels the application's hidden state and original-workspace restoration history. A subsequent launcher activation respects the window's current workspace and focuses it there. A subsequent Hide records that new origin and selects an inactive destination.

- Keep the process, native window identity, page, unsaved edits, saved connection and server sockets. Use the normal production sandbox on both Wayland and X11.

- Use bounded local control calls and verify their result from compositor state. Record the intended operation before dispatch so a timeout or partial result can be reconciled. A failed Hide that leaves the window visible reports failure without marking it hidden. If Hide applied before a response was lost, retain its ownership record and reconcile it on the next available control connection.

- If compositor control becomes unavailable after Hide, keep the original window, edits and connection alive and mark restore pending. Give a nonintrusive desktop notification; a later launcher activation retries that exact owned window when control returns. Do not destroy, reload or replace it. Restoration while the control service remains unavailable is a failed operation, not a passing recovery result.

- Create no persistent system settings, desktop rules, keybindings or user authentication changes. An application restart begins with a normal visible window and does not adopt another process's hidden window.



## Acceptance stays independent of the implementation


Test five consecutive Hide/launcher-restore cycles on a real isolated Hyprland session for each backend and packaged entrypoint. Prove the targeted window is absent from every visible monitor while hidden and returns to its recorded workspace afterward. A compositor registry entry, Electron visibility property or renderer screenshot alone cannot establish that result.


This changes the native primitive: a special-workspace window remains mapped. Therefore the new test must measure actual workspace/output visibility, together with native identity and original before/hidden/after captures. Preserve the existing Electron Hide failures in this report; do not relabel them as passes. Weston tests continue to cover ordinary desktop Minimize and existing packaged flows, and cannot substitute for Hyprland-specific acceptance.


After each restore, require the same process/window/document, a hidden-period server update, live sockets, unchanged saved connection, persistent edits and sandbox evidence. Include two profiles, failed or missing control API, delayed startup, rapid requests, closed/replaced targets, workspace removal, manual workspace movement and the supported window states. Physical host checks and full application verification remain release gates.


## Decision and implementation status

The human approved this compositor-owned Hide design on October 5, 2026. Independent proposal review passed; the approved source fragment has SHA-256 `75ae169f13830d4a94015c0f1b8b1d5945fae48a6beee42ecf84717d287410e4`. This Markdown copy preserves the approved requirements and corrects one grammatical typo.

This is a working design, not the governing product/architecture spec tree. Spec conversion and convergence, proof convergence, implementation-plan review and execution-method selection remain required. No application code, package or installation implements this replacement yet. Native Wayland restore remains failed on the existing candidate.

The rejected alternative requires a broader engine change separating rendering progress from ownership of unreleased software/GPU/overlay buffers, plus a maintained custom runtime. No such engine change is approved or implemented.
