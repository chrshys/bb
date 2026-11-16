# @bb/desktop

macOS, Linux, and Windows Electron shell for bb. The desktop app loads the existing bb
web UI and uses the packaged `bb-app` launcher for server and host-daemon
lifecycle.

## Development

From the repo root, run `pnpm dev` in one terminal for the source server and
live UI updates. In a second terminal, start the Electron shell:

```bash
pnpm exec turbo run dev --filter=@bb/desktop
```

The dev script builds `bb-app`, compiles the Electron main/preload files, and
opens Electron directly. By default it uses the same checkout-scoped
`~/.bb-dev/<checkout-instance>` data directory and deterministic high ports as
`pnpm dev`; it prints the resolved data dir, server URL, and
Electron user-data dir at startup. It intentionally overwrites inherited
`BB_DATA_DIR`, `BB_SERVER_PORT`, `BB_SERVER_URL`, and `BB_HOST_DAEMON_PORT` so a
desktop dev run launched from an existing bb session still targets the current
checkout. Set `BB_DESKTOP_USER_DATA_DIR` to override only Electron's user-data
directory.

The launcher probes the checkout's Vite app port at startup and adapts:

- **`pnpm dev` is already running** (Vite reachable): the shell loads the Vite
  dev URL, so you get live source and HMR for `@bb/app` changes — no rebuild
  needed. It still attaches to the same running server/daemon for all API/WS
  traffic. The launcher prints `app <url> (Vite dev server — live reload)`. This
  is the fast loop for iterating on the desktop UI.
- **`pnpm dev` is not running**: the shell starts its own `bb-app` runtime and
  loads the built UI it serves, so you must rebuild (re-run this task) to pick up
  source changes. The launcher prints `app (own bb-app runtime — …)`.

The override is plumbed via `BB_DESKTOP_APP_URL`, which the launcher only sets
when Vite is confirmed reachable; it is never set in packaged builds, so
production always loads the server's own built UI.

To run the slower unpacked Electron Builder app, which more closely matches the
packaged runtime and keeps native dependencies rebuilt for Electron's bundled
Node runtime:

```bash
pnpm exec turbo run start --filter=@bb/desktop
```

Electron is pinned to `44.3.0`. macOS builds require macOS 13 (Ventura) or
newer. The bundled `bb-app` runtime uses `better-sqlite3@13.0.3`, whose N-API
binaries work with Electron without an ABI-specific rebuild. The packaging
hook opens an in-memory database with Electron before accepting the packaged
SQLite module; older ABI-specific modules still use the prebuild fallback.

macOS notifications require a signed application. Unsigned local and CI artifact
builds cannot display macOS notifications. Published releases use the existing
signing and notarization workflow.

The shipped Linux x64 SQLite prebuild requires glibc 2.34 or newer and
libstdc++ with `GLIBCXX_3.4.29` support (GCC 11 or newer).

The AppImage packaging patch exposes its bundled legacy `libnotify` only as
`libnotify.so`. Electron first tries the system's versioned library names, so
libnotify 0.7.10 or newer can supply notification activation tokens on Wayland.
If no versioned system library loads, Electron can still use the bundled
unversioned fallback for notifications. Older libraries keep their existing
notification behavior but cannot forward activation tokens.

Electron downloads its development runtime lazily; the desktop test command
installs it before starting parallel workers.

The macOS bundle declares macOS 13 as its minimum. The release feed generator
writes the corresponding Darwin kernel minimum, 22.0.0, into both JSON and YAML
update feeds. Run it before publishing release artifacts so older Macs reject
incompatible updates.

## Validation

The built-in browser allows file downloads using Electron's native save dialog.
Files are saved on the machine running the desktop app, including downloads
initiated in desktop browser automation tabs.

```bash
pnpm exec turbo run typecheck --filter=@bb/desktop --filter=bb-app
pnpm exec turbo run build --filter=@bb/desktop
pnpm exec turbo run test --filter=@bb/desktop --filter=bb-app --force
pnpm exec turbo run dev --filter=@bb/desktop
```

The desktop tests include an Electron startup smoke that opens a real window.
On Linux it runs only when `DISPLAY` is set; on a headless host, wrap the test
command in `xvfb-run -a`, as CI does.

## Packaging

```bash
pnpm exec turbo run desktop:build --filter=@bb/desktop
pnpm exec turbo run smoke:packaged --filter=@bb/desktop
```

Artifacts are written under `apps/desktop/release/`. The macOS build is Apple
Silicon arm64-only; Intel Macs are not a target. Without signing secrets, local builds
sign with a code-signing identity auto-discovered from the keychain and skip
notarization. A valid signature matters even for local builds: macOS
provenance-tracks unsigned apps, forcing syspolicyd to evaluate every exec in
the app's process tree, which can stall process launches system-wide. On
machines with no keychain identity (or with `CSC_IDENTITY_AUTO_DISCOVERY=false`,
as CI sets for workflow-artifact-only builds), artifacts remain unsigned and
macOS shows the normal Gatekeeper warning on first launch.

For local verification without publishing, use
`pnpm exec turbo run package --filter=@bb/desktop` on macOS, or
`pnpm exec turbo run package:linux --filter=@bb/desktop` on Linux.

npm's bundled dependencies are copied through an explicit `files` entry into
`node_modules/npm/node_modules`, including nested dependency versions. pnpm's
dependency listing omits this bundled tree, and electron-builder's dependency
copier excludes nested `node_modules`. `asarUnpack` alone cannot preserve files
that the collector never selected. The explicit file set enters both ASAR's
file index and its unpacked resources before signing.

Packaging runs an offline npm smoke check in `afterPack`, before signing or
publishing. This requires a native target host (macOS arm64 or Linux x64).
`smoke:packaged` repeats it against the resulting artifact. To run only npm
verification without opening a desktop window:

```bash
pnpm exec turbo run smoke:packaged-npm --filter=@bb/desktop
pnpm exec turbo run smoke:packaged-npm --filter=@bb/desktop -- /absolute/path/to/bb.app/Contents/MacOS/bb
```

On Linux, the optional argument is the executable inside `linux-unpacked/` or
an extracted AppImage. The check resolves npm from packaged `bb-app`, audits
required dependency edges and version ranges in npm's entire bundled tree using
both CJS and ESM resolution, rejects paths outside packaged resources, imports npm's ESM display
dependencies, and verifies its version. It then uses bundled Electron and npm
to pack, install, and update a disposable plugin's dependency from 1.0.0 to
2.0.0, verifying the lockfile and importing the plugin's ESM entry after each
install. It uses the plugin install flags, an empty PATH, offline mode, a fresh
HOME/cache/config, and disabled lifecycle scripts. No system Node/npm or user
store is used by the child processes. It also hashes ASAR and unpacked resources
before and after to reject bundle mutations. Fixtures are removed afterward.

The bb-app tarball smoke covers a different packaging pipeline and cannot
detect Electron artifact omissions. A source build or `npm --version` alone
does not verify a desktop plugin dependency install.

### Windows (NSIS, x64)

Windows packaging needs a Windows x64 host; `afterPack` refuses to cross-build
because it verifies the packaged native modules by loading them. From the repo
root, install with `pnpm install --frozen-lockfile --ignore-scripts`, then build
an unpacked app, an installer, or smoke test the current packaged output with:

```powershell
pnpm exec turbo run package:win --filter=@bb/desktop
pnpm exec turbo run desktop:build:win --filter=@bb/desktop
pnpm exec turbo run smoke:packaged --filter=@bb/desktop
```

`desktop:build:win` writes `release/BBC-<version>-x64.exe`, a one-click
per-user NSIS installer that installs to `%LOCALAPPDATA%\Programs\bbc`
(`bbc-nightly` on the nightly channel) without elevation, plus `latest.yml`
for electron-updater.
Without a signing certificate the installer is unsigned, so Windows SmartScreen
warns before running it. electron-builder signs it when `WIN_CSC_LINK` (a
base64 `.pfx`) and `WIN_CSC_KEY_PASSWORD` are set; the release workflows pass
them from the `WINDOWS_CERTIFICATE_PFX` and `WINDOWS_CERTIFICATE_PASSWORD`
secrets.

`afterPack` copies `@parcel/watcher-win32-x64` into the package when
electron-builder leaves it out and loads it with the packaged Electron; without
it the file watcher cannot start.

Windows builds check `desktop-version-windows.json` for new versions and
install them with electron-updater from `latest.yml` (`nightly.yml` on the
nightly channel). The update downloads in the background and the installer runs
silently when the app quits or when the user chooses Relaunch.

### Linux (AppImage, x64)

Linux packaging targets x64 glibc-based distributions. Install `python3`,
`make`, and `g++` so node-gyp can build node-pty during dependency installation.

From the repo root, build an unpacked app, an AppImage distribution, or smoke
test the current packaged output with:

```bash
pnpm exec turbo run package:linux --filter=@bb/desktop
pnpm exec turbo run desktop:build:linux --filter=@bb/desktop
pnpm exec turbo run smoke:packaged --filter=@bb/desktop
```

Running an AppImage normally requires FUSE and, on some distributions, the
`libfuse2` compatibility package. If FUSE is unavailable, launch it with
`--appimage-extract-and-run` instead.

Linux users whose window manager supplies all window controls can remove the
native Electron title bar with `--no-window-frame`:

```bash
./BBC-x86_64.AppImage --no-window-frame
```

The native frame remains the default. Changing this startup option requires a
full desktop app restart.

Linux users can opt into a transparent Electron window with
`--transparent-window`:

```bash
./bb-x86_64.AppImage --transparent-window
```

The window remains opaque by default. Transparency also requires a compositor
that supports it, and Electron documents limitations including unsupported
window shaping and unreliable resize behavior on some platforms. The flag can
be combined with `--no-window-frame`, and changing it requires a full desktop
app restart.

CI builds Linux artifacts on the pinned `ubuntu-22.04` runner. The AppImage
links against the build machine's glibc, so that pin sets the oldest
distribution that can run a published build. Raise it deliberately.

Linux gets both update paths, but they are not equivalent:

- The JSON version feed (`desktop-version-linux.json`) is polled on every Linux
  install and reports that a newer release exists.
- Self-installing auto-update runs only inside an AppImage whose directory the
  app can write to. electron-updater detects the AppImage through the `APPIMAGE`
  environment variable, and its install step unlinks the running file _before_
  moving the replacement in — so a read-only directory would delete the app and
  leave nothing behind. Both the startup check and the install handler verify
  write and search access on the parent directory first.
- Everything else — an extracted directory, a distribution package, or an
  AppImage in a read-only location — reports new versions without installing
  them.

The Linux AppImage is unsigned, and electron-updater performs no signature
check on Linux: it verifies only the SHA-512 recorded in the update metadata
that ships beside it. macOS installs through Squirrel, which additionally
requires the replacement to satisfy the running app's code-signing
requirement. Write access to the release assets is therefore sufficient to
push code to Linux clients. Treat the release token accordingly.

## Releasing

`bb-app` and `@bb/desktop` versions are LOCKED in lockstep. The desktop package
depends on `bb-app: workspace:*`, and the displayed release version string must
match `packages/bb-app/package.json`.

To bump for a release:

```bash
node scripts/bump-version.mjs <new-version>
```

Then commit the version bump to the fork's `custom` branch. You can also use
`--patch`, `--minor`, or `--major` instead of an explicit version.

CI enforces this lockstep. Direct edits that leave
`packages/bb-app/package.json` and `apps/desktop/package.json` with different
versions fail the build. Never edit either package version directly for a
release; use `scripts/bump-version.mjs` so both files move together.

The upstream `Build Desktop` workflow is restricted to `get-bb/bb`. BBC test
builds use the separate `Build BBC Desktop Test Channel` workflow, which builds
macOS, Linux, and Windows together and publishes only to `chrshys/bb`.
`bbc-desktop-test` and `bbc-desktop-nightly` are moving channel tags. Increase
the locked package version for every roll forward.

Each platform's installer and Electron metadata are published in the same
release. The renderer version feed is also uploaded for every platform:

| Platform | Artifacts              | electron-updater metadata | Version feed                   |
| -------- | ---------------------- | ------------------------- | ------------------------------ |
| macOS    | `.dmg`, `.zip` (arm64) | `latest-mac.yml`          | `desktop-version.json`         |
| Linux    | `.AppImage` (x64)      | `latest-linux.yml`        | `desktop-version-linux.json`   |
| Windows  | `.exe` installer (x64) | `latest.yml`              | `desktop-version-windows.json` |

macOS keeps the unsuffixed feed name because released macOS builds already
request it. macOS binaries use ad-hoc signing for friendly tests when Developer ID
and notarization secrets are absent. Linux
AppImages are unsigned; Windows installers are signed when Windows certificate
secrets are configured.

## Nightly channel

The BBC nightly desktop is a separate installation:

- product name: `BBC Nightly`
- bundle identifier: `dev.bb.desktop.nightly`
- Linux binary name: `bbc-nightly`, so it never shadows stable `bbc` on PATH
- app/update release: `bbc-desktop-nightly`
- Windows install directory: `%LOCALAPPDATA%\Programs\bbc-nightly`
- update metadata: `nightly-mac.yml`, `nightly-linux.yml`, and `nightly.yml`
  (Windows)
- version feeds: `desktop-version.json` (macOS),
  `desktop-version-linux.json` (Linux), and `desktop-version-windows.json`
  (Windows)
- icon: `assets/icon-nightly.icns` and `assets/icon-nightly.png`

Download it from
[`bbc-desktop-nightly`](https://github.com/chrshys/bb/releases/tag/bbc-desktop-nightly)
after dispatching the BBC test workflow with `release_channel=nightly`.

Stable and nightly desktop bundles can coexist. Electron-owned preferences,
window state, and process supervision use separate application data
directories; the embedded BBC runtime uses `~/.bbc` data and
default server port unless the corresponding environment variables are
overridden.

Nightly builds set `BB_DESKTOP_RELEASE_CHANNEL=nightly` at build time. The value
is baked into the Electron main/preload bundles and selects the nightly product
identity, yellow icon, and update URLs. Omit the variable (or set it to
`latest`) for stable and local builds.

## About panel

The app menu's About item opens a message box listing the facts a bug report
needs: version, build type, commit, build date and how old that build is
("3 days old"), plugin SDK version, Electron version, and OS. Its **Copy**
button puts that whole block on the clipboard. The age is computed when the
dialog opens, so a long-running session still reports it correctly.

The native About panel is populated too, minus the age, since Electron takes
those options once at startup. `scripts/build.mjs` bakes the build-time half of
the facts into the bundles:

| Variable                | Default when unset                                    |
| ----------------------- | ----------------------------------------------------- |
| `BB_DESKTOP_COMMIT`     | `GITHUB_SHA`, else `git rev-parse HEAD`, else unknown |
| `BB_DESKTOP_BUILD_DATE` | The build's own timestamp, ISO 8601                   |

The plugin SDK version is read from `packages/plugin-sdk/package.json` at build
time. A checkout with no git metadata reports `Commit: unknown` rather than
failing the build.

## macOS signing + notarization

The desktop package is ready for Developer ID signing and Apple notarization.
Local builds with no secrets sign via keychain auto-discovery and skip
notarization. To activate signed and notarized release artifacts, add these
GitHub Actions secrets:

| Secret                       | Value                                                                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MACOS_CERTIFICATE_P12`      | Base64-encoded `.p12` exported from Keychain Access for a `Developer ID Application` certificate and its private key. On macOS: `base64 -i DeveloperID.p12 -o certificate.base64.txt`. |
| `MACOS_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12`.                                                                                                                                               |
| `MACOS_CERTIFICATE_NAME`     | Optional certificate common name, without the `Developer ID Application:` prefix. Leave unset when the `.p12` contains a single usable identity and electron-builder can derive it.    |
| `APPLE_ID`                   | Apple ID email for the Developer Program account.                                                                                                                                      |
| `APPLE_APP_PASSWORD`         | App-specific password from `appleid.apple.com` under Sign-In and Security.                                                                                                             |
| `APPLE_TEAM_ID`              | Developer Team ID from `developer.apple.com/account` membership details.                                                                                                               |

The BBC test workflow uses these secrets when all are configured. Without them,
it packages an ad-hoc signed friendly-test build; the Mac update control then
opens the release page for manual installation. Partial secret sets fail the
workflow. Ad-hoc signing does not provide Gatekeeper trust or Squirrel.Mac's
stable Developer ID identity for in-place replacement.

## Auto-update

### BBC personal test channel

The BBC fork uses its own public GitHub Releases in `chrshys/bb`. Stable BBC
test builds use `bbc-desktop-test`; the separate nightly identity uses
`bbc-desktop-nightly`. Electron's platform metadata and the renderer's
`desktop-version*.json` feeds use the same release base URL resolved by
`scripts/desktop-release-channel.mjs`. Neither path can fall back to
`get-bb/bb`. The `Build BBC Desktop Test Channel` workflow is separate from the
upstream signed release workflows and refuses to run outside `chrshys/bb` on
the `custom` branch.

Test binaries and update metadata are public because `chrshys/bb` is a public
repository. Anyone can download a published test build. The workflow builds
macOS arm64, Linux x64, and Windows x64 artifacts first; it publishes only
after every platform succeeds. It uploads all installers before replacing the
Electron metadata, then moves the renderer version feeds last. Existing older
installer assets remain available on the release page.

To publish a test build from the Mac mini:

1. Review and merge the prepared changes into `custom` on `chrshys/bb`.
2. Run `node scripts/bump-version.mjs <new-version>` with a version greater than
   the installed test build and the currently published channel. The current
   shell/test build is `0.46.0`, so its first update must be `0.46.1` or higher.
   This keeps `bb-app` and desktop in lockstep. Published clients only accept
   newer versions; never reuse a version for different bits. Commit and push
   the changes to `custom`.
3. Dispatch **Build BBC Desktop Test Channel** on `custom`, choosing `latest`
   (normal BBC install) or `nightly` (separate install). Without Apple secrets,
   the macOS artifact is ad-hoc signed and intended for friendly testing. The
   authenticated Mac mini command is:

   ```bash
   gh workflow run build-bbc-desktop-test.yml \
     --repo chrshys/bb --ref custom \
     -f release_channel=latest
   gh run watch --repo chrshys/bb
   ```

4. Confirm all macOS, Linux, Windows, and publish jobs succeeded. Manually
   install the first `.dmg` on each Mac and `.exe` on each Windows device; the
   existing `57c0004` build has updates disabled and cannot discover its first
   feed. On Mac, **Check** reports a newer version and **Open download** opens
   the BBC release page. Download the arm64 `.dmg`, quit BBC, open the DMG, and
   drag BBC into Applications, confirming replacement. On Windows, the signed
   update metadata drives the normal electron-updater install flow.

For a safe roll forward, publish a strictly higher version and let one workflow
run finish all platform builds before starting another. The publish job uploads
new versioned installers first, replaces each channel's `latest*.yml` or
`nightly*.yml` metadata next, and replaces the JSON feeds last. It checks that
the three feeds agree and rejects a version that is not higher than the current
channel. If a build is bad, publish a fixed build with another higher version;
clients do not downgrade from a release that has already installed.

The no-credential Mac workflow uses an ad-hoc code signature, which is enough
for macOS arm64 packaging but is not a Developer ID signature and is not
notarized. A DMG downloaded from GitHub is quarantined and may be blocked by
Gatekeeper; macOS may offer **Open Anyway** in Privacy & Security after the
user attempts to open it. Do not disable Gatekeeper or remove quarantine.
Squirrel.Mac checks the installed bundle's code-signing requirement before
replacing it, so ad-hoc builds do not use automatic in-place replacement. The
Check control therefore opens the release page and the user manually replaces
the app from the DMG. To provide a normally trusted public installer and
reliable automatic Mac replacement, configure a Developer ID Application
certificate and Apple notarization credentials. Windows builds work without a certificate,
but Windows SmartScreen warns for an unsigned installer; configure the existing
`WINDOWS_CERTIFICATE_PFX` and `WINDOWS_CERTIFICATE_PASSWORD` secrets to sign it.
The Linux AppImage is unsigned and Linux is included as a convenience, though it
is not one of the target test devices.

This workflow does not create a GitHub release during code review. After the
changes are merged and pushed to `custom`, the remaining publication action is
to dispatch the workflow above. The push and dispatch are deliberately left to
the coordinator/user after review.

The renderer update check reads the BBC-owned `desktop-version*.json` feed. On
macOS it never downloads or replaces the app; **Open download** opens the
matching BBC Releases channel page. This is intentional because the friendly
ad-hoc signature cannot safely satisfy Squirrel.Mac's installed-app identity
check. Signed/notarized production builds retain the signing configuration,
but BBC's Mac UI remains manual until an explicitly tested signed automatic
update path is enabled. Windows uses electron-updater with `latest.yml` or
`nightly.yml`; Linux AppImages use automatic replacement only when the current
file is writable.

`BBC Nightly` follows the isolated `bbc-desktop-nightly` release and
`nightly-mac.yml`; it never reads or moves the stable feed. The workflow uses the complete signing/notarization secret set when configured;
otherwise it packages a friendly-test nightly build with manual Mac install.

To verify a downloaded or unpacked build:

```bash
spctl --assess --verbose /path/to/bb.app
codesign --verify --deep --strict --verbose=2 /path/to/bb.app
```

## Debugging

Use the View menu to toggle DevTools. To open them automatically on launch, set
`BB_DESKTOP_OPEN_DEVTOOLS=1`:

```bash
BB_DESKTOP_OPEN_DEVTOOLS=1 apps/desktop/release/mac-arm64/bb.app/Contents/MacOS/bb
```

When the desktop app spawns `bb-app`, server and daemon logs land under
`~/.bb/logs/` or `$BB_DATA_DIR/logs/` when `BB_DATA_DIR` is set.

To verify attach-if-found manually, start a compatible bb first, then launch the
desktop app:

```bash
npx bb-app@latest
pnpm exec turbo run dev --filter=@bb/desktop
```

The desktop supervisor handles normal quits plus `SIGINT` and `SIGTERM`, and it
writes a PID file so the next launch can reap a stale Electron-owned `bb-app`
launcher. Hard crashes such as process aborts, segfaults, or kernel-level kills
cannot run cleanup in the crashing process; the startup PID-file reap is the
recovery path for those cases.

### Saved servers

Use **bb → Desktop Settings → Server → Add Server…** to save and switch to
another machine's HTTP(S) bb server URL. **Window → Server** opens the same
menu. Saved URLs remain in the menu across restarts; adding an existing URL
selects it without creating a duplicate. **This Mac** on macOS or **This
Computer** on Linux switches back to the built-in server without removing
saved entries.

**Set Server URL…** edits the last selected custom server. Clearing its URL removes
that entry and switches an active custom target to the built-in server. Other
saved servers and Connect discovery remain available. Existing single-server preferences are
loaded automatically into the saved list in `<userData>/server-target.json`.

The app command palette lists **Switch to <server>** for each inactive choice
from this same Server menu, including Connect discovery. Palette list requests
use the menu's discovery refresh policy (at most once per minute, with the
existing ten-minute background refresh). The optional `window.bbDesktop`
`getServerChoices`, `onServerChoicesChange`, and `selectServer` methods expose
only `{id, name, active}`; custom server IDs are opaque hashes. Selection is
validated against native choices and runs the menu's existing authentication,
window navigation, and runtime lifecycle. Older desktop shells omit these actions.

### Server moves

After `bb server move`, the old computer's data dir (`~/.bb` or
`$BB_DATA_DIR`) contains `server-moved.json`. The desktop app reads it at
startup, whenever the built-in server target loads, and while that target is active.
While the target is active, the app watches the data dir. If `fs.watch` fails,
for example with `ENOSPC`, the app checks the file every 2 seconds instead
(`src/server-moved.ts`). The server writes the lock before the new machine
takes over and removes it if the move is rolled back, so the app acts only on a
committed move. A move is committed when the local server address answers
`/health` with 410 `code: "server_moved"`, or when nothing listens there and no
launcher process is alive. The app checks once when it starts or loads the
built-in server. When a move finishes while the app is open, the app checks every
second for up to 120 seconds. It stops if the lock disappears. The first time the app
sees a committed lock for a `moveId`, it switches the server target once:

- `mode: "connect"` selects `connectHandle` with `serverUrl`.
- `mode: "direct"` sets the custom server URL. When a move finishes while
  the app is open, the app waits up to 60 seconds for the new `/health`
  endpoint before it switches the window.

The app shows "Your bb server moved to <toHostName>" once for each `moveId`
(`<userData>/server-move-notice.json`). It still starts its own `bb-app`
launcher unless another bb process answers the local server port. The launcher
runs this computer as a regular machine, and quitting the app stops it. If the
app has no stored bb Connect credential, it signs in to a connect target with
the `x-bb-connect-machine` header that the move wrote to the data dir's
`config.json`. The app logs a warning and ignores an invalid lock.

On startup, a saved built-in server choice also switches to the moved server;
it never starts the old copy automatically. A different saved remote server
choice remains selected. Explicitly picking the built-in server while the move
lock exists shows "bb moved to <toHostName>" with **Open <toHostName>** and
**Choose server…**. The screen explains whether the old copy is locked or was
deleted. Selecting the built-in server does not unlock the old copy or remove
its background machine service.

Startup error screens list their actions as buttons. Any screen where
retrying can help shows **Try again**. **Choose server…** opens the Server menu,
where the user can select the built-in server if needed. A bb Connect
`unauthorized` error has no **Try again**, because the same credential fails
the same way. **Reconnect** opens account sign-in in a desktop
window. The app clears its old account sign-in, waits for a new session, then
retries the selected server. A valid account session can mint and renew the
desktop session when a machine credential is rejected. Closing the sign-in
window leaves the error screen available. Fatal errors have no buttons. The renderer sends the chosen
action on `bb-desktop:startup-action`. The main process accepts only actions
from the error page that is currently loaded in an app window's main frame.
