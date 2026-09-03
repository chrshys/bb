# sf-bb

This fork produces a team build named **sf-bb**. Each computer runs an
independent local bb server, host daemon, database, and Electron profile while
sharing the application code and bundled customizations from the `sf-bb`
branch.

The installed app uses the normal `~/.bb` data directory and default ports
(`38886` and `38887`). Stock bb and sf-bb must not run simultaneously on one
computer because they share that runtime state.

## Install a team release

Apple Silicon Mac releases are published at:

<https://github.com/chrshys/bb/releases/tag/desktop-sf-bb>

Download the `.dmg`, drag **sf-bb** to Applications, and launch it. Releases
built without Apple Developer signing require Control-clicking the app and
choosing **Open** on first launch.

Each installation has its own projects, threads, messages, credentials,
browser data, and machine-specific settings. Only application source and
customizations committed to the fork are shared. Never synchronize `~/.bb`
with a file synchronization service.

## Team release channel

A push to the `sf-bb` branch runs
[Release sf-bb](.github/workflows/release-sf-bb.yml). The workflow:

1. validates the desktop packages;
2. derives a monotonically increasing custom version;
3. builds Apple Silicon `.dmg` and `.zip` artifacts;
4. publishes an immutable `sf-bb-v<version>` release; and
5. refreshes the moving `desktop-sf-bb` release and update feed.

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
thread reconnects after the packaged runtime returns.

For a manual installation without the delayed self-restart:

```bash
pnpm sf-bb:install
pnpm sf-bb:switch
```

The installed app is `/Applications/sf-bb.app`. Keep stock bb installed as a
fallback. To switch back, quit sf-bb and open `/Applications/bb.app`.

The custom desktop app has its own Electron profile. If browser session cookies
do not survive an application-identity rename, use **Import** in the Browser
panel once more.
