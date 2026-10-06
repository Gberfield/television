*Linux packaging, installation, launch identity, sandbox requirements and update-feed ownership.*

# Linux distribution and updates

This downstream addition extends the Mac distribution and updater specs for Linux. It bundles the same four desktop entrypoints and local setup assets, Electron 43.7.6, desktop icon, MIT license, third-party notices and Electron/Chromium license files. electron-builder 26.16.1 produces an x86_64 portable tar.gz and AppImage from a disposable standalone staging package. Linux updater code is bundled; The Linux bundle selects its update entrypoint at build time and excludes ToDesktop; Mac/development bundles retain the original external ToDesktop runtime.

The Linux launcher selects a Wayland or X11 Ozone backend from the session unless supplied in its arguments or `TV_OZONE_PLATFORM`. Distribution files provide `computer.telepath.television.desktop`, an icon, a graphical installer and an Arch PKGBUILD. The installer validates supported architecture and required package files, supports paths containing spaces, writes only its selected user prefix and XDG application/icon directories, preserves the user's Television data and requires no root privileges. Arch installation places the binary in `/opt/television`, a launcher in `/usr/bin`, desktop/icon resources in `/usr/share`, and gives `chrome-sandbox` root ownership and mode 4755 through pacman's normal installation.

After `app.setName("Television")`, the Linux-target bundle starts its own update adapter; Mac/development bundles retain ToDesktop's existing initialization and event semantics. AppImage update checks require a build-configured HTTPS URL, packaged state and an AppImage path. A malformed URL, credentials in the URL or absent conditions cause no updater construction or requests. electron-updater 6.8.9 downloads and verifies the feed's SHA512 before reporting `update-downloaded`. Checks occur initially and every four hours. Errors are handled and subsequent checks remain possible. Quit installs a downloaded update; explicit restart is ignored until one has downloaded. Disposal clears scheduled checks.

The immutable preload `desktopPlatform` identifies the operating system to the served app. The existing update bridge method names and IPC channels do not change. Linux gate fallback instructions replace absent instructions or a channel containing a known ToDesktop `/mac/` installer URL; other channel instructions are preserved. A downloaded update takes priority on all platforms.

Testing combines contract tests at the updater boundary, real scripts with temporary installation paths and an actual packaged-Electron launch. Tests must include invalid feed, failed/repeated check, duplicate download, premature restart, space-containing paths, no-frame Mac regression, Linux menus and native platform identity. Real release-feed hosting and an actual AppImage replacement remain separate acceptance evidence.

Host sandbox acceptance uses the packaged test's `TV_LINUX_REQUIRE_SANDBOX=1` selector. It overrides the generic desktop harness's cloud-only sandbox opt-out for the packaged child, requires the production sandbox settings and checks the renderer's Linux seccomp and no-new-privileges state. If the host cannot launch that package with its sandbox, the check fails; it never falls back to an unsandboxed launch. The generic harness's ordinary cloud policy is unchanged.

The preload also maintains a narrow compatibility observer for the known upstream `.desktop-upgrade-gate .upgrade-gate-body` markup. It replaces only a paragraph containing a `dl.todesktop.com` `/mac/` link with the UI-owned Linux fallback paragraph. It preserves surrounding Lit range/comment nodes, other dialogs and downloaded-update/restart content. Future server markup changes require renewed compatibility verification.

## Hyprland window lifecycle

The Linux main process selects the Hyprland behavior when a colon-separated `XDG_CURRENT_DESKTOP` entry equals `Hyprland`, ignoring case and surrounding whitespace. In that session, startup obtains Electron's single-instance lock for its application profile before waiting for readiness or loading a connection. A process that loses the lock quits without creating a window or loading a connection. Other sessions retain their existing startup and native Minimize behavior. ^linux-hyprland-instance

Hyprland's Hide/reveal path uses a main-process visibility controller and a local compositor transport, never Electron `BrowserWindow.hide()`. The transport initially supports verified Hyprland 0.56.2 Lua query/dispatch/event capabilities; other versions remain unavailable until separately verified. Session-name detection selects the menu and profile lock, while verified compositor identity/capability gates movement. An unavailable API must not fall back to the failing Electron Hide path. Electron 43.7.6 remains pinned. ^linux-hyprland-adapter

Only the live owned main window is eligible. Bootstrap requires an unambiguous compositor client with the main process PID and exact Television application identity, validated inside the action, then binds its address to a random per-window marker and the captured compositor session. Every mutation validates that same ownership within the compositor before acting. Missing, ambiguous, destroyed/replaced or wrong-session targets must not affect another client. Markers are collision/stale-target defenses, not authentication against all programs sharing the user account. ^linux-hyprland-owner

Hide moves that window to its own inactive named special workspace without following it. The destination must be inactive on every monitor; an exposed destination requires a fresh owned inactive one or refusal. Restore moves the same window to its recorded origin and requests focus. Placement and recovery policy follow [the product promises](../../product/linux-desktop.md#^linux-hyprland-placement). Do not create persistent settings, rules or bindings. A new process must not adopt an old process's window. Transient markers, observers and child processes are cleanup-owned. ^linux-hyprland-reveal

The controller records desired visibility before dispatch, serializes reconciliation and verifies actual workspace/output visibility before reporting an outcome. Repeated Hide preserves its origin. Early same-profile activation records a desired visible state fulfilled once the first window exists; late readiness must not undo Hide. A pending old operation cannot defeat a newer launcher request or a person's manual placement. Each minted action carries both an application request revision and the observed external-change revision; within the same compositor action, reject stale application revisions or a mismatched external revision before mutation. Manual movement/reveal increments the compositor's external revision, including when a higher application revision has not yet arrived. Do not refresh a stale action's external fence at execution. Own confirmed moves are distinguished from manual changes. Operating-system focus policy still governs attention. ^linux-hyprland-ordering

Control uses shell-free `hyprctl` argument vectors against the captured session with a two-second command deadline and one-MiB output ceiling. Lua string data is encoded rather than interpolated as code. Visible-state observation is bounded by ten seconds; command exit or acknowledgement is insufficient for success. A timed-out child may already have issued a command, so ownership/intended action survive for reconciliation. Continuing control loss returns pending/failed restore, preserves the original window and emits the product's nonintrusive notification; later launcher activation retries without replacing the document or endless background retries. Disposal immediately invalidates old callbacks/actions and returns completion for bounded release of owned transient resources. A cancelled quit must leave the surviving controller usable. Confirmed window closure starts disposal; final application quit waits for owned cleanup completion while command deadlines can still execute. Cleanup failure is not reported as confirmed observer removal. ^linux-hyprland-control

The controller/transport contracts are:

```ts
type VisibilityOutcome = { status: 'visible' | 'hidden' | 'pending' | 'refused'; reason?: string };
type WindowOwner = { pid: number; applicationID: string; session: string; marker: string; address?: string };
type VisibilityIntent = { owner: WindowOwner; revision: number; expectedExternalRevision: number;
  visible: boolean; originWorkspace?: number; holdingWorkspace?: string };
type CompositorObservation =
  | { status: 'unavailable'; reason: string }
  | { status: 'missing' | 'ambiguous' | 'replaced' }
  | { status: 'owned'; owner: WindowOwner; workspace: number; workspaceName: string;
      visibleOnMonitors: number[]; existingWorkspaces: number[]; normalWorkspaces: number[];
      activeNormalWorkspace: number | null; supportedWindowState: boolean; externalRevision: number };
interface HyprlandTransport {
  inspect(owner: WindowOwner): Promise<CompositorObservation>;
  apply(intent: VisibilityIntent): Promise<{ acknowledged: boolean }>;
  watch(owner: WindowOwner, changed: () => void): () => void;
  dispose(): void | Promise<void>;
}
interface HyprlandVisibilityController {
  request(visible: boolean): Promise<VisibilityOutcome>;
  dispose(): void | Promise<void>;
}
```

`createHyprlandControl(options: { session: string }): HyprlandTransport` constructs the real local transport. `createHyprlandVisibility(options: { owner: WindowOwner; transport: HyprlandTransport; notify: (message: string) => void }): HyprlandVisibilityController` constructs the controller. Main-process code keeps the existing profile lock, connection/navigation state and native window lifetime; no renderer or installer interface changes. ^linux-hyprland-contract
