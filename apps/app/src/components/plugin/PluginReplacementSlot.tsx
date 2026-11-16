import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";
import type { ResolvedReplacement } from "@/lib/plugin-slot-resolvers";
import { PluginSlotMount } from "./PluginSlotMount";

interface PluginReplacementRegistration {
  id: string;
  pluginId: string;
  generation: number;
}

const PluginOwnerRendererContext = createContext<ReactNode>(null);

function PluginOwnerRenderer() {
  return useContext(PluginOwnerRendererContext);
}

export function PluginReplacementSlot<
  Registration extends PluginReplacementRegistration,
>({
  children,
  crashFallback,
  instanceId,
  onCrash,
  original,
  replacement,
  slotKind,
}: {
  children: (registration: Registration, Original: ComponentType) => ReactNode;
  crashFallback?: ReactNode;
  instanceId?: string;
  onCrash?: (pluginId: string) => void;
  original: ReactNode;
  replacement: ResolvedReplacement<Registration>;
  slotKind: string;
}) {
  if (replacement.kind === "owner") return original;

  const registration = replacement.registration;
  return (
    <PluginOwnerRendererContext.Provider value={original}>
      <PluginSlotMount
        key={`${registration.pluginId}/${registration.id}/${registration.generation}/${instanceId ?? ""}`}
        pluginId={registration.pluginId}
        slotKind={slotKind}
        slotId={registration.id}
        instanceId={instanceId}
        crashFallback={
          crashFallback === undefined ? <PluginOwnerRenderer /> : crashFallback
        }
        {...(onCrash === undefined ? {} : { onCrash })}
      >
        {children(registration, PluginOwnerRenderer)}
      </PluginSlotMount>
    </PluginOwnerRendererContext.Provider>
  );
}
