# sf-bb

This repository is `chrshys/bb`, a personal fork of `get-bb/bb`. The `sf-bb`
branch produces an Apple Silicon desktop app named **sf-bb** with the fork's
browser automation and customizations.

Each Mac runs its own server, host daemon, database, and Electron profile. The
packaged runtime still uses the normal `~/.bb` data directory and ports 38886
and 38887. Do not run stock bb and sf-bb against that shared state at the same
time. See [the sf-bb release runbook](docs/sf-bb-release-process.md) for release,
rollback, signing, coexistence, and upstream-sync procedures.

## Install on a new Mac

Download the Apple Silicon DMG from the
[`desktop-sf-bb` release](https://github.com/chrshys/bb/releases/tag/desktop-sf-bb),
then drag **sf-bb** to Applications. An ad-hoc-signed release may require
**System Settings > Privacy & Security > Open Anyway** on first launch. The
Terminal alternative is:

```bash
xattr -dr com.apple.quarantine /Applications/sf-bb.app
```

Choose **Always Allow** if macOS asks for access to `sf-bb Safe Storage`.

## Check and update

From a checkout:

```bash
pnpm sf-bb:version
pnpm sf-bb:update -- --when now
pnpm sf-bb:schedule -- install
```

The updater needs no Node toolchain when invoked directly. A Mac without a
checkout can keep a standalone copy:

```bash
mkdir -p "$HOME/bin"
curl -fsSL https://raw.githubusercontent.com/chrshys/bb/sf-bb/scripts/sf-bb -o "$HOME/bin/sf-bb"
chmod +x "$HOME/bin/sf-bb"
"$HOME/bin/sf-bb" update --when now
"$HOME/bin/sf-bb" schedule install
```

Scheduled updates check immediately and hourly, stage while sf-bb is busy, and
restart after 24 hours if the app never becomes idle. Inspect them with:

```bash
pnpm sf-bb:schedule -- status
tail -f "$HOME/Library/Logs/sf-bb-update.log"
```

## Develop and package locally

```bash
pnpm sf-bb:dev
pnpm sf-bb:stop
pnpm sf-bb:build
pnpm sf-bb:deploy
```

The development app is checkout-isolated and supports HMR; it is not the
packaged custom release channel. A local package uses a protected
`-local.<timestamp>.<commit>` version. `deploy` builds it, waits briefly, then
replaces and relaunches sf-bb. A released build will not replace a local build
unless `sf-bb update --force` is used.

Full operating procedures live in
[docs/sf-bb-release-process.md](docs/sf-bb-release-process.md).
