# bb Custom

This checkout can produce a local daily-driver build named **bb Custom**. It is
separate from the stock `/Applications/bb.app`, but its embedded runtime uses
the normal `~/.bb` data directory and default ports (`38886` and `38887`). The
normal `bb` CLI therefore targets it while it is running.

Stock bb and bb Custom must not run simultaneously because they share that
runtime state. Custom builds do not check for or install upstream desktop
updates.

## Development loop

```bash
pnpm custom:dev
pnpm custom:stop
```

The development instance is checkout-isolated and supports frontend HMR. Its
data is intentionally separate from `~/.bb`.

## Promote changes to the daily app

```bash
pnpm custom:install
```

This builds an ad-hoc-signed unpacked application and atomically installs it at
`/Applications/bb Custom.app`. If bb Custom is already running, quit it before
reinstalling.

The first cutover should be initiated from a normal Terminal, not from an agent
currently hosted by stock bb:

```bash
cd ~/Projects/bb-custom
pnpm custom:switch
```

The switch command quits stock bb, waits for its server to release port 38886,
and opens bb Custom. Keep stock bb installed as a fallback. To switch back,
quit bb Custom and open `/Applications/bb.app`.

Because bb Custom has a separate Electron profile, import the desired browser
session once in its Browser panel even if it was already imported in the
development instance.
