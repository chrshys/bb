export const grokMinimalThemeCss = `:root,
.light {
  --canvas: #ffffff;
  --ink: #202020;
  --primary: #242424;
  --primary-foreground: #ffffff;
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --radius: 0.75rem;
  --muted-foreground: color-mix(in oklch, var(--ink) 72%, var(--canvas));
  --subtle-foreground: color-mix(in oklch, var(--ink) 60%, var(--canvas));
  --readback-foreground: color-mix(in oklch, var(--ink) 64%, var(--canvas));
  --sidebar: #f7f7f7;
  --border: color-mix(in oklch, var(--ink) 12%, var(--canvas));
  --border-hairline: color-mix(in oklch, var(--ink) 9%, var(--canvas));
  --border-seam: color-mix(in oklch, var(--ink) 6%, var(--canvas));
  --file-accent: #405f8c;
}
.dark {
  --canvas: #171717;
  --ink: #ededed;
  --primary: #ededed;
  --primary-foreground: #171717;
  --sidebar: #121212;
  --file-accent: #a2bde4;
}

[data-timeline-row-list="top-level"],
[data-app-composer][data-promptbox-shell] {
  width: 100%;
  max-width: 48rem;
  margin-inline: auto;
  min-width: 0;
}

[data-follow-up-composer] form:has([data-promptbox-layout]),
[data-promptbox-shell] > form:has([data-promptbox-layout]) {
  border-radius: 1.5rem;
  border-color: color-mix(in oklch, var(--ink) 15%, var(--canvas));
  background: color-mix(in oklch, var(--ink) 3%, var(--canvas));
  box-shadow: 0 2px 12px rgb(0 0 0 / 3%);
}
[data-follow-up-composer] form:focus-within {
  border-color: color-mix(in oklch, var(--ink) 32%, var(--canvas));
}
[data-promptbox-submit-action] {
  border-radius: 999px;
}
[data-sidebar="panel"] {
  background: var(--sidebar);
}
[data-sidebar-thread-shortcut-target] {
  border-radius: 0.65rem;
}
@media (max-width: 640px) {
  [data-follow-up-composer] form:has([data-promptbox-layout]) {
    border-radius: 1.15rem;
  }
}


:root, .light, .dark {
  --text-xs: 0.875rem;
  --text-xs--line-height: 1.25rem;
  --text-sm: 1rem;
  --text-sm--line-height: 1.5rem;
  --text-base: 1.125rem;
  --text-base--line-height: 1.75rem;
}
[data-timeline-row-list="top-level"] [data-message-body] {
  font-size: 1.125rem;
  line-height: 1.65;
  --text-sm: 1.125rem;
  --text-sm--line-height: 1.65;
}
[data-promptbox-shell] [role="textbox"] {
  font-size: 1.125rem;
  line-height: 1.5;
}


@media (min-width: 768px) {
  :root, .light, .dark {
    --text-xs: 0.8125rem;
    --text-xs--line-height: 1.125rem;
    --text-sm: 0.875rem;
    --text-sm--line-height: 1.25rem;
    --text-base: 1rem;
    --text-base--line-height: 1.5rem;
  }
  [data-timeline-row-list="top-level"] [data-message-body] {
    font-size: 1rem;
    --text-sm: 1rem;
  }
  [data-promptbox-shell] [role="textbox"] { font-size: 1rem; }
  [data-testid="sidebar-footer-row"] button[aria-label^="Settings"]::after { font-size: 0.875rem; }
}

:is([class~="text-[8px]"], [class~="text-[9px]"], [class~="text-[10px]"],
    [class~="text-[11px]"], [class~="text-[12px]"]) {
  font-size: 0.8125rem !important;
  line-height: 1.4 !important;
}
`;
