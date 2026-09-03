# Releasing sf-bb

This is the operating runbook for the `chrshys/bb` fork's Apple Silicon
`sf-bb` channel. The upstream stable release process is documented separately
in [bb-release-process.md](bb-release-process.md).

The public repository is part of the deployment architecture. Every installed
app fetches its update metadata and archive without GitHub credentials, and
GitHub-hosted macOS runners build the releases. Keep `chrshys/bb` public unless
both distribution and runner billing are deliberately replaced.

## Cut a release

A push to `sf-bb` validates, packages, and publishes automatically:

```bash
git push origin sf-bb
gh run list --workflow release-sf-bb.yml --branch sf-bb --limit 3
gh run watch <run-id>
```

A manual dispatch builds an artifact without publishing by default. Set the
input explicitly to publish:

```bash
gh workflow run release-sf-bb.yml --ref sf-bb -f publish=true
```

The workflow creates two GitHub releases:

- `sf-bb-v<version>` is an immutable prerelease for one build.
- `desktop-sf-bb` is the moving latest release and unauthenticated update feed.

The moving release is updated in safety order: binary assets, tag and release
metadata, `build-info.json`, `custom-mac.yml`, then `desktop-version.json` last.
The workflow verifies the published identity and archive before succeeding.
Ad-hoc apps and `scripts/sf-bb` poll `desktop-version.json`; only a signed build
with Electron self-update enabled consumes `custom-mac.yml`.

Linux source validation and the Apple Silicon build run in parallel. A separate
publish job has write access and starts only after both succeed. Validation
typechecks the repository and tests the app, server, desktop, Plugin Guide, and
Plugin SDK. Its logs remain attached to the Actions run for seven days.

## Verify a release

Read the moving feed and identity without a GitHub token:

```bash
curl -fsSL https://github.com/chrshys/bb/releases/download/desktop-sf-bb/desktop-version.json
curl -fsSL https://github.com/chrshys/bb/releases/download/desktop-sf-bb/build-info.json
```

Inspect the immutable release identified by the feed version:

```bash
gh release view sf-bb-v<version>
gh release view sf-bb-v<version> --json assets --jq '.assets[].name'
git rev-list -n 1 sf-bb-v<version>
```

The release body, immutable tag, `build-info.json`, and the app's
`BbDesktopCommit` key must name the same commit. A successful run contains a
DMG, ZIP, blockmap, `custom-mac.yml`, `desktop-version.json`, and
`build-info.json` on both releases.

## Check or update a machine

From a checkout:

```bash
pnpm sf-bb:version
pnpm sf-bb:update -- --when now
pnpm sf-bb:schedule -- status
```

The first command exits 0 when the installed bundle is current, 1 when a newer
release exists, and 2 when state cannot be read. The updater validates the
feed, download size, SHA-512 digest, code signature, archive root, and bundle
version before an atomic replacement.

Check the running server and installed bundle independently:

```bash
curl -fsS http://localhost:38886/api/v1/system/version
/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' /Applications/sf-bb.app/Contents/Info.plist
/usr/libexec/PlistBuddy -c 'Print BbDesktopCommit' /Applications/sf-bb.app/Contents/Info.plist
```

The packaged `bb` CLI used by an sf-bb-owned shell is:

```text
/Applications/sf-bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb
```

Run `which bb` and `bb status` inside a shell opened by the app to confirm the
active installation.

## Version scheme and identity

Team releases use `<next-patch>-sf.<workflow-run-id>.<attempt>`. Re-running a
workflow produces a new attempt suffix rather than overwriting an immutable
version. Local packages use `<next-patch>-local.<UTC-timestamp>.<commit>` and
append `-dirty` when the checkout has changes.

For the same base version, SemVer sorts `local` before `sf`, and a stable
upstream version after both prereleases. The updater protects every `-local.`
bundle from replacement unless `--force` is given, regardless of ordering.

Each release publishes `build-info.json` with the version, full commit, UTC
build date, Actions run URL, and `custom` channel. The same commit and date are
stored in `Info.plist` as `BbDesktopCommit` and `BbDesktopBuildDate`.

## Failure modes

Validation or packaging failures publish nothing. Inspect the failed step with:

```bash
gh run view <run-id> --log-failed
```

The `release-sf-bb` concurrency group does not cancel an active release. Later
pushes queue behind it. The version and ancestry guards reject a run that would
move the feed backward or publish unrelated history.

If a run fails after creating its immutable release but before moving the feed,
first compare the immutable tag, moving feed, and workflow log. The normal
recovery is a failed-job rerun, which gets a new attempt version:

```bash
gh run rerun <run-id> --failed
gh run watch <run-id>
```

Leave an immutable release that reached the feed in place. If a release and tag
were provably orphaned before the feed moved and cleanup is required, delete
only that exact version after owner confirmation:

```bash
gh release delete sf-bb-v<orphan-version> --cleanup-tag --yes
```

## Roll back a change

Do not move the feed to an older version and do not delete a release that was
installed. The monotonic feed guard intentionally blocks that rollback model.
Revert the bad code and publish the revert as a newer build:

```bash
git revert <bad-commit>
git push origin sf-bb
gh run watch <new-run-id>
```

If the bad change is already reverted on `sf-bb`, a dispatch with
`publish=true` produces a new version from that commit.

## Signing

The current release is ad-hoc signed. It has a different macOS code identity on
each build, so updates can repeat the `sf-bb Safe Storage` Keychain prompt and
TCC grants. Choose **Always Allow** for the Keychain prompt. The updater clears
quarantine, but a manually downloaded build on macOS 15 may need **System
Settings > Privacy & Security > Open Anyway** or:

```bash
xattr -dr com.apple.quarantine /Applications/sf-bb.app
```

Ad-hoc builds do not use Electron self-update. `scripts/sf-bb update` and its
launchd schedule provide the update path until stable signing is configured.

The workflow enables Developer ID signing, notarization, and self-update only
when the complete required secret set is present:

| Secret                       | Value                                          |
| ---------------------------- | ---------------------------------------------- |
| `MACOS_CERTIFICATE_P12`      | Base64-encoded Developer ID Application `.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | Password used to export the `.p12`             |
| `MACOS_CERTIFICATE_NAME`     | Optional certificate common name               |
| `APPLE_ID`                   | Apple Developer Program account email          |
| `APPLE_APP_PASSWORD`         | Apple ID app-specific password                 |
| `APPLE_TEAM_ID`              | Apple Developer Team ID                        |

Record certificate and app-password expiry dates when these are configured.
The first stable-identity cutover on each Mac is manual: quit sf-bb, install the
signed release, launch it, and grant Keychain and TCC access once.

## Upstream sync

`main` is a fast-forward mirror of `get-bb/bb`. `sf-bb` also tracks the head of
upstream PR #2796, `gantis-storm/browser-automation`. Merge; never rebase the
published `sf-bb` history because immutable release tags point into it.

Add the missing upstream remote before the first fetch:

```bash
git remote add upstream https://github.com/get-bb/bb.git
git fetch upstream main refs/pull/2796/head:refs/remotes/upstream/pr-2796
```

For later syncs:

```bash
gh repo sync chrshys/bb --source get-bb/bb --branch main
git fetch origin main sf-bb
git fetch upstream main refs/pull/2796/head:refs/remotes/upstream/pr-2796
git switch sf-bb
git merge --no-edit upstream/pr-2796
git merge --no-edit origin/main
pnpm exec turbo run typecheck
git push origin sf-bb
```

If only the generated Plugin SDK inventory conflicts, regenerate it after
installing dependencies:

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run update:sdk-inventory --filter=@bb/plugin-api-map
git add packages/plugin-api-map/sdk-public-api.json
git commit --no-edit
```

If only `pnpm-lock.yaml` conflicts, take the incoming lockfile and regenerate
it from the merged manifests:

```bash
git checkout --theirs pnpm-lock.yaml
pnpm install --lockfile-only
git add pnpm-lock.yaml
git commit --no-edit
```

Stop for manual resolution when any source file conflicts. When PR #2796 is
merged upstream, stop merging its pull-ref and remove that step from the sync
workflow before the next sync.

### Planned automation

SFR-11 will add `sync-upstream.yml` with the same merge and validation path. It
will remain dispatch-only until it has completed three hands-off runs. A
schedule probe on 2026-09-03 received no events over multiple 15-minute
intervals on the active default branch, so GitHub cron is not trusted for this
fork.

## Fork workflow hygiene

Only `.github/workflows/release-sf-bb.yml` is active. These inherited workflows
are disabled in the fork's Actions settings:

- `ci.yml`
- `version-lockstep.yml`
- `publish-bb-app.yml`
- `build-desktop.yml`
- `deploy-web.yml`
- `deploy-connect.yml`
- `deploy-demo-server.yml`
- `mobile-e2e.yml`
- `mobile-ios-eas.yml`
- `mobile-runner-probe.yml`
- `marketplace-v2-live.yml`

An upstream sync can add workflows. Recheck after every sync:

```bash
gh api repos/chrshys/bb/actions/workflows \
  --jq '.workflows[] | select(.state=="active") | .path'
```

## Coexistence with stock bb

The packaged sf-bb runtime and stock bb both default to `~/.bb` and ports 38886
and 38887. Migrations are forward-only. Once sf-bb is ahead, do not launch a
stock build against the same data directory. Use a separate directory for an
intentional stock test:

```bash
BB_DATA_DIR="$HOME/.bb-stock-test" npx bb-app@latest
```

The desktop probe can attach to a compatible server that already owns port
38886, even when that server came from another channel. The sf-bb updater
refuses to replace the app when either runtime port has a non-sf-bb owner and
exits 3 with the owner and PID. Never synchronize `~/.bb` through a file-sync
service.

## Set up a new Mac

1. Download the Apple Silicon DMG from the
   [`desktop-sf-bb` release](https://github.com/chrshys/bb/releases/tag/desktop-sf-bb).
2. Drag `sf-bb` to Applications and complete the ad-hoc Gatekeeper step above.
3. Launch the app and choose **Always Allow** if `sf-bb Safe Storage` prompts.
4. Keep a checkout or install the standalone updater:

   ```bash
   mkdir -p "$HOME/bin"
   curl -fsSL https://raw.githubusercontent.com/chrshys/bb/sf-bb/scripts/sf-bb -o "$HOME/bin/sf-bb"
   chmod +x "$HOME/bin/sf-bb"
   "$HOME/bin/sf-bb" schedule install
   ```

5. Run `which bb` and `bb status` from an sf-bb shell to confirm the CLI and
   data directory.

The schedule checks immediately and hourly. It stages while sf-bb is running,
applies on the next idle run, and forces a restart after 24 hours. A forced
restart may require a one-time macOS Automation grant. Inspect
`~/Library/Logs/sf-bb-update.log` with `scripts/sf-bb schedule status`.

## Local tooling

Every command is available as `scripts/sf-bb <command>`; checkout commands also
have `pnpm sf-bb:<command>` wrappers.

| Command    | Behavior                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `dev`      | Starts the checkout-isolated source app with HMR; this is not a packaged custom-channel build. |
| `stop`     | Stops the checkout-isolated development app.                                                   |
| `build`    | Creates an ad-hoc-signed local bundle without installing it.                                   |
| `install`  | Builds and installs while sf-bb is stopped.                                                    |
| `deploy`   | Builds, waits 20 seconds, then replaces and relaunches sf-bb.                                  |
| `update`   | Downloads and verifies a released bundle, then stages or installs it.                          |
| `schedule` | Installs, removes, or inspects the per-user launchd updater.                                   |
| `switch`   | Quits other bb apps and launches the installed sf-bb bundle.                                   |
| `status`   | Shows versions and which bb applications are running.                                          |
| `version`  | Compares installed, released, and running versions; `--json` is machine-readable.              |

`update` accepts `--force`, `--when idle|now`, `--version <version>`, and
`--max-age <hours>`. `schedule install` accepts `--interval <seconds>` and
`--max-age <hours>`; reinstall it after moving the checkout or standalone
script because launchd stores the absolute script path.

Build commands require Node 22.19 or newer in the Node 22 line and the exact
pnpm version in `package.json`. `BB_CUSTOM_NODE_BIN` can identify the Node bin
directory. `BB_SF_BB_DEPLOY_DELAY_SECONDS` changes the deploy delay.
`BB_SF_BB_STDIO_IS_EVENT_LOG` is internal to the launchd agent and should not be
set manually.
