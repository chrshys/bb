# sf-bb

This checkout produces a local daily-driver build named **sf-bb**. It is
separate from the stock `/Applications/bb.app`, but its embedded runtime uses
the normal `~/.bb` data directory and default ports (`38886` and `38887`). The
normal `bb` CLI therefore targets it while it is running.

Stock bb and sf-bb must not run simultaneously because they share that runtime
state. sf-bb does not check for or install upstream desktop updates.

## Development loop

```bash
pnpm sf-bb:dev
pnpm sf-bb:stop
```

The development instance is checkout-isolated and supports frontend HMR. Its
data is intentionally separate from `~/.bb`.

## Promote changes from inside sf-bb

```bash
pnpm sf-bb:deploy
```

This builds and stages an ad-hoc-signed application, then safely quits, replaces,
and relaunches sf-bb after a short delay. A thread running the deployment should
send its final response before the delayed restart. The thread reconnects after
the packaged runtime returns.

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
