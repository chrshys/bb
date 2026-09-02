import { listPluginMarketplaces, type DbQueryConnection } from "@bb/db";
import {
  BUILTIN_PUBLISHER_LABEL,
  CURATED_MARKETPLACE_NAME,
  parseMarketplaceManifestJson,
} from "./marketplace-manifest.js";

const RESERVED_PUBLISHER_LABELS: Record<string, true> = {
  [BUILTIN_PUBLISHER_LABEL]: true,
  "BB Official": true,
  "BB Community": true,
};

export function marketplacePublisherLabel(args: {
  marketplaceName: string;
  displayName: string;
}): string {
  if (args.marketplaceName === CURATED_MARKETPLACE_NAME)
    return args.displayName;
  return args.displayName in RESERVED_PUBLISHER_LABELS
    ? args.marketplaceName
    : args.displayName;
}

export function marketplacePublisherLabels(
  db: DbQueryConnection,
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const row of listPluginMarketplaces(db)) {
    let displayName = row.name;
    try {
      displayName = parseMarketplaceManifestJson(
        row.manifestJson,
        `stored "${row.name}" marketplace catalog`,
      ).displayName;
    } catch {}
    labels.set(
      row.name,
      marketplacePublisherLabel({
        marketplaceName: row.name,
        displayName,
      }),
    );
  }
  return labels;
}

export function pluginPublisherLabel(args: {
  sourceKind: "path" | "builtin" | "npm" | "git";
  provenance: "builtin" | "direct" | "catalog";
  catalogMarketplaceName: string | null;
  labels: ReadonlyMap<string, string>;
}): string | null {
  if (args.sourceKind === "builtin" || args.provenance === "builtin") {
    return BUILTIN_PUBLISHER_LABEL;
  }
  if (args.provenance !== "catalog") return null;
  const name = args.catalogMarketplaceName;
  if (name === null) return null;
  return args.labels.get(name) ?? name;
}
