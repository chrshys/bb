# sf-bb

This fork produces a team build named **sf-bb**. Each computer runs an
independent local bb server, host daemon, database, and Electron profile while
sharing the application code and bundled customizations from the `sf-bb`
branch.

The installed app uses the normal `~/.bb` data directory and default ports
(`38886` and `38887`). Stock bb and sf-bb must not run simultaneously on one
computer because they share that runtime state.

## Install a team release

From a checkout, install the newest verified release with:

```bash
pnpm sf-bb:update -- --when now
```

The updater needs no Node toolchain when invoked directly. A Mac without a
checkout can keep a standalone copy:

```bash
mkdir -p ~/bin
curl -fsSL https://raw.githubusercontent.com/chrshys/bb/sf-bb/scripts/sf-bb -o ~/bin/sf-bb
chmod +x ~/bin/sf-bb
~/bin/sf-bb update --when now
```

The updater verifies the release feed, download size, SHA-512 digest, code
signature, bundle structure, and version before replacing the installed app.
It retains the previous app until the replacement move succeeds.

The manual fallback is the Apple Silicon Mac release at:

<https://github.com/chrshys/bb/releases/tag/desktop-sf-bb>

Download the `.dmg`, drag **sf-bb** to Applications, and launch it. Releases
built without Apple Developer signing require opening **System Settings >
Privacy & Security** and choosing **Open Anyway** on first launch. You can also
run `xattr -dr com.apple.quarantine /Applications/sf-bb.app` in Terminal.

Each installation has its own projects, threads, messages, credentials,
browser data, and machine-specific settings. Only application source and
customizations committed to the fork are shared. Never synchronize `~/.bb`
with a file synchronization service.

## Team release channel

A push to the `sf-bb` branch runs and publishes
[Release sf-bb](.github/workflows/release-sf-bb.yml). A manual dispatch must use
the `sf-bb` ref. It uploads an installable workflow artifact but publishes only
when its `publish` input is `true`. The workflow:

1. validates the desktop packages and confirms the runner is Apple Silicon;
2. derives a version newer than the live feed and rejects unrelated history;
3. builds and launches the packaged app with the desktop smoke test;
4. publishes a versioned `sf-bb-v<version>` prerelease; and
5. refreshes the moving `desktop-sf-bb` release, then verifies its feed and zip.

Without signing secrets, the workflow publishes an ad-hoc-signed build for
manual installation. With the complete signing secret set, it signs and
notarizes the app and bakes automatic updates into the build.

Configure these GitHub Actions secrets to enable automatic installation:

| Secret                       | Value                                           |
| ---------------------------- | ----------------------------------------------- |
| `MACOS_CERTIFICATE_P12`      | Base64-encoded Developer ID Application `.p12`  |
| `MACOS_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12`         |
| `MACOS_CERTIFICATE_NAME`     | Optional certificate common name                |
| `APPLE_ID`                   | Apple Developer Program account email           |
| `APPLE_APP_PASSWORD`         | App-specific password from the Apple ID account |
| `APPLE_TEAM_ID`              | Apple Developer Team ID                         |

The custom updater reads:

- `https://github.com/chrshys/bb/releases/download/desktop-sf-bb/desktop-version.json`
- `https://github.com/chrshys/bb/releases/download/desktop-sf-bb/custom-mac.yml`

## Fork workflow hygiene

The fork keeps only `release-sf-bb.yml` enabled. The inherited `ci.yml`,
`version-lockstep.yml`, `publish-bb-app.yml`, `build-desktop.yml`,
`deploy-web.yml`, `deploy-connect.yml`, `deploy-demo-server.yml`,
`mobile-e2e.yml`, `mobile-ios-eas.yml`, `mobile-runner-probe.yml`, and
`marketplace-v2-live.yml` workflows are disabled in GitHub Actions settings.
After each upstream sync, list active workflows and disable any newly inherited
workflow that should not run on the fork:

```bash
gh api repos/chrshys/bb/actions/workflows \
  --jq '.workflows[] | select(.state=="active") | .path'
```

## Keep official bb improvements

`origin` is the public team fork and `upstream` is the official bb repository.
Keep `main` aligned with upstream and merge it into the custom branch:

```bash
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
git switch sf-bb
git merge main
git push origin sf-bb
```

Resolve and test any conflict before pushing `sf-bb`. Prefer plugins, themes,
and small isolated commits over broad core changes to reduce future conflicts.

## Development loop

```bash
pnpm sf-bb:dev
pnpm sf-bb:stop
```

The development instance is checkout-isolated and supports frontend HMR. Its
data is intentionally separate from `~/.bb`.

## Promote a local checkout

```bash
pnpm sf-bb:deploy
```

This builds and stages an ad-hoc-signed application, then safely quits,
replaces, and relaunches sf-bb after a short delay. A thread running the
deployment should send its final response before the delayed restart. The
thread reconnects after the packaged runtime returns. Local bundles use a
`-local.<timestamp>.<commit>` version, with `-dirty` added when the checkout has
changes. They intentionally always show the team release as available and are
never replaced by `update` without `--force`.

For a manual installation without the delayed self-restart:

```bash
pnpm sf-bb:install
pnpm sf-bb:switch
```

The installed app is `/Applications/sf-bb.app`. Keep stock bb installed as a
fallback. To switch back, quit sf-bb and open `/Applications/bb.app`.

## Local tooling

`scripts/sf-bb status`, `scripts/sf-bb switch`, and `scripts/sf-bb version` do
not require Node. Neither does `scripts/sf-bb update`. `version` compares the
installed bundle and public release feed, then reports the server listening on
port 38886 when one is running. Use `scripts/sf-bb version --json` for
machine-readable output. It exits 0 when no update is needed, 1 when the feed
is newer, and 2 when the feed or a version cannot be read.

`scripts/sf-bb update` defaults to `--when now` in a Terminal and `--when idle`
without a TTY. Idle updates download and verify immediately, then stage the app
until sf-bb is no longer running. Use `--version <v>` for a specific immutable
release. A version containing `-local.` is protected from replacement unless
`--force` is present. Update activity is appended with UTC timestamps to
`~/Library/Logs/sf-bb-update.log`.

Build commands need the Node version in `.nvmrc`. The script checks
`BB_CUSTOM_NODE_BIN` first, then asks Volta for the `.nvmrc` version, then uses
a compatible Node already on `PATH`. `BB_CUSTOM_NODE_BIN` must name the bin
directory, not the `node` executable itself.

`scripts/sf-bb install` refuses to replace a running sf-bb app. Run
`scripts/sf-bb switch` from a normal Terminal after a manual install because
switching apps stops the server that hosts bb agent threads. `deploy` waits 20
seconds by default; set `BB_SF_BB_DEPLOY_DELAY_SECONDS` to change the delay.
Its output is appended with UTC timestamps to
`~/Library/Logs/sf-bb-deploy.log`.

Ad-hoc releases have a new macOS code identity on each build. The first launch
after an update can prompt again for `sf-bb Safe Storage`; choose **Always
Allow**. Stable identity is deferred until the signing task is completed.

The custom desktop app has its own Electron profile. If browser session cookies
do not survive an application-identity rename, use **Import** in the Browser
panel once more.
