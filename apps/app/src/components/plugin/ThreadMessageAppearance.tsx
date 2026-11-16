import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PluginSlotMount } from "./PluginSlotMount";
import {
  usePluginSlots,
  type PluginThreadMessageAppearanceSlot,
} from "@/lib/plugin-slots";

interface MessageAppearanceStyle extends CSSProperties {
  "--human-message-foreground": string;
}

const ThreadMessageAppearanceContext = createContext<
  MessageAppearanceStyle | undefined
>(undefined);

function appearanceStyle(value: unknown): MessageAppearanceStyle | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("humanMessageBackgroundColor" in value)
  )
    return undefined;
  const color = value.humanMessageBackgroundColor;
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))
    return undefined;
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  const foreground =
    luminance > 0.179
      ? "color-mix(in oklch, var(--ink) 0.1%, black)"
      : "color-mix(in oklch, var(--canvas) 0.1%, white)";
  return {
    backgroundColor: color,
    color: foreground,
    "--human-message-foreground": foreground,
  };
}

function AppearanceReader({
  slot,
  threadId,
  onChange,
}: {
  slot: PluginThreadMessageAppearanceSlot;
  threadId: string;
  onChange: (style: MessageAppearanceStyle | undefined) => void;
}) {
  const value = slot.useAppearance({ threadId });
  const style = appearanceStyle(value);
  const backgroundColor = style?.backgroundColor;
  const color = style?.color;
  useEffect(() => {
    onChange(
      backgroundColor && color
        ? { backgroundColor, color, "--human-message-foreground": color }
        : undefined,
    );
    return () => onChange(undefined);
  }, [backgroundColor, color, onChange]);
  return null;
}

export function ThreadMessageAppearanceProvider({
  threadId,
  children,
}: {
  threadId: string;
  children: ReactNode;
}) {
  const { threadMessageAppearances } = usePluginSlots();
  const slot = threadMessageAppearances[0];
  const key = slot
    ? `${slot.pluginId}/${slot.id}/${slot.generation}/${threadId}`
    : null;
  const [appearance, setAppearance] = useState<{
    key: string | null;
    style: MessageAppearanceStyle | undefined;
  }>();
  const instanceId = useId();
  const onChange = useCallback(
    (style: MessageAppearanceStyle | undefined) =>
      setAppearance({ key, style }),
    [key],
  );
  return (
    <>
      {slot ? (
        <PluginSlotMount
          key={key}
          pluginId={slot.pluginId}
          slotId={slot.id}
          slotKind="threadMessageAppearance"
          instanceId={`${threadId}/${slot.generation}/${instanceId}`}
          crashFallback={null}
        >
          <AppearanceReader
            slot={slot}
            threadId={threadId}
            onChange={onChange}
          />
        </PluginSlotMount>
      ) : null}
      <ThreadMessageAppearanceContext.Provider
        value={
          key !== null && appearance?.key === key ? appearance.style : undefined
        }
      >
        {children}
      </ThreadMessageAppearanceContext.Provider>
    </>
  );
}

export function useHumanMessageAppearance(
  humanPresentation: boolean,
): MessageAppearanceStyle | undefined {
  const style = useContext(ThreadMessageAppearanceContext);
  return humanPresentation ? style : undefined;
}
