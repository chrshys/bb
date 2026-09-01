import { isAllowedBrowserNavigationUrl } from "@bb/domain";

export const isAllowedBrowserUrl = isAllowedBrowserNavigationUrl;

interface WindowOpenDecision {
  openTabUrl: string | null;
}

export function resolveWindowOpenAction(url: string): WindowOpenDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { openTabUrl: null };
  }
  return {
    openTabUrl:
      parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null,
  };
}

interface PopupRateDecision {
  allowed: boolean;
  timestamps: number[];
}

interface EvaluatePopupRateArgs {
  timestamps: readonly number[];
  now: number;
  windowMs: number;
  maxInWindow: number;
}

export function evaluatePopupRate({
  timestamps,
  now,
  windowMs,
  maxInWindow,
}: EvaluatePopupRateArgs): PopupRateDecision {
  const recent = timestamps.filter((stamp) => now - stamp < windowMs);
  if (recent.length >= maxInWindow) {
    return { allowed: false, timestamps: recent };
  }
  return { allowed: true, timestamps: [...recent, now] };
}
