# BBC desktop chrome

BBC uses the floating app shell on the web and desktop. macOS keeps Electron's
native traffic lights at `(18, 18)`, with an 84px horizontal reserve for the
sidebar toggle. The sidebar header and page headers remain window drag regions;
controls retain their no-drag classes. Full-screen releases the light reserve.
The page headers own their right-panel controls, and sidebar history stays in
the sidebar, as on the web. The reusable upstream framed sidebar primitive is
retained, but AppLayout no longer selects it.

The navigation rail is hidden by shared shell CSS rather than a selected theme.
The Settings row uses the existing Settings action. Other footer actions remain
available. Bots Sidebar remains the default-enabled bundled plugin from the
BBC packaging branch; core does not identify that plugin in its layout.

## Theme

Fresh stores select `grok-minimal`. Its CSS is bundled into the server at
`apps/server/src/services/system/grok-minimal.ts`, using the existing custom-theme
catalog and CSS response. An existing `theme/grok-minimal/theme.css` takes
precedence. Explicit saved selections are retained. Settings → Appearance,
`bb theme set <id>`, and SDK `theme.set` continue to use the existing theme path.
`bb theme set default` selects stock BB's palette; it does not restore the rail.

## Browser review

From this worktree, run `~/.local/bin/dev-preview up app`. The `app` profile starts
the real Vite app, server and host daemon through Turbo. It uses `.bbc-preview/`
inside the checkout, checkout-derived backend ports, and the preview helper's
reserved forwarding port. Every listener binds to `127.0.0.1`. The launcher
removes inherited `BB_*` variables, checks ports, and registers the private URL
with `BB_APP_URL`. Its forwarding proxy limits upstream connections to keep a
cold Vite module graph from overwhelming the private HTTPS proxy.

Open the URL printed by the helper with one of these query strings:

- `?desktopChrome=web`: ordinary browser chrome.
- `?desktopChrome=macos`: macOS chrome with colored stand-in traffic lights and
  dashed outlines marking drag regions.
- `?desktopChrome=fullscreen`: macOS full-screen chrome without the lights or
  their horizontal reserve.

The selected simulation stays in that tab's session storage across navigation.
Use the links with a full navigation to change modes. The switch is guarded by
Vite's development flag, and a real Electron bridge always takes precedence.
It simulates platform and full-screen chrome, not native APIs such as embedded
browsing, file opening, or window movement. The markers cannot prove native
traffic-light placement, dragging, double-click behaviour, or full-screen
transitions. Those require the final Electron window.

The store starts without projects, bots or conversations. Skip setup to inspect
the empty main shell. No installed app data is imported. Use
`~/.local/bin/dev-preview down app` to stop only this preview.

## Desktop-specific surfaces

| Surface | Source and purpose | Status |
| --- | --- | --- |
| Open workspace dropdown | `ThreadDetailView.tsx`, `ThreadWorkspaceOpenButton.tsx`, `useWorkspaceOpenTargets.ts`: discovers editors, file managers and terminals through the reachable local daemon and opens the current workspace. This can appear in local web sessions too; a remote browser typically has no reachable local daemon. | Header entry hidden by `SHOW_WORKSPACE_OPEN_HEADER_BUTTON`; command and file-opening actions retained. |
| Native traffic lights, window frame | `desktop-window-factory.ts`: close, minimize and full-screen controls in the native macOS title area. | Retained at existing native coordinates. |
| Drag and full-screen reserve | `bb-desktop.ts`, `useDesktopWindowState.ts`, page/sidebar headers. | Carried into floating layout. |
| Framed title bar's history and panel controls | `AppLayout.tsx`, `WindowRightPanelToggle.tsx`: used to host global history, sidebar and right-panel buttons above the framed panels. | Uses the web locations in sidebar/page headers. |
| Zoom indicator | `DesktopZoomIndicator.tsx`: transient zoom percentage and reset control after native zoom changes. | Retained. |
| Find-in-window | `WindowFindHost.tsx`: positions native find UI using the chrome row height. | Retained. |
| Native menus, shortcuts, server selection and window lifecycle | Desktop menu and command bridge; new window/tab, server switching, reload, zoom, logs, developer tools and app commands. | Retained. |
| Embedded browser | Desktop browser bridge and secondary-panel browser content; native web view navigation and bounds synchronization. | Retained. |
| Desktop updates and appearance sync | Desktop info/update integration and `useDesktopThemeSync.ts`; update indicators and native light/dark appearance. | Retained; BBC packaging already disables self-update. |

No installer is built until the browser review is accepted. The final check is
an ARM64 macOS package with this session's `BB_*` environment removed.
