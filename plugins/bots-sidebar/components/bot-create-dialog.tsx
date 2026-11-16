import { useRef, useState } from "react";
import type { BotAvatar, BotMetadata } from "../contract";
import { randomAvatar } from "../lib/appearance";
import { AvatarColorSwatches, AvatarShapePicker } from "./avatar-appearance";
import { BotIcon } from "./bot-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type NewBotFields = Pick<BotMetadata, "hostId" | "name" | "role" | "avatar" | "sectionId" | "linkedProjectIds" | "soul" | "memory" | "settings"> & { ownedProjectIds: string[]; defaultProjectId: null };

export function BotCreateDialog({ hosts, onClose, onCreate }: {
  hosts: Array<{ id: string; connected: boolean }>;
  onClose: () => void;
  onCreate: (value: NewBotFields) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<BotAvatar>(() => randomAvatar());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const hostId = hosts.find((host) => host.connected)?.id ?? hosts[0]?.id ?? null;
  const ready = Boolean(name.trim()) && hostId !== null;
  async function submit() {
    if (saving.current || !ready || hostId === null) return;
    saving.current = true; setPending(true); setError(null);
    try {
      await onCreate({ hostId, name: name.trim(), role: "Assistant", avatar, sectionId: null, soul: "", memory: "", settings: {}, linkedProjectIds: [], ownedProjectIds: [], defaultProjectId: null });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { saving.current = false; setPending(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving.current) onClose(); }}>
    <DialogContent className="bot-create-dialog flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm">
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <DialogHeader className="shrink-0 px-5 pt-5 pr-10">
          <DialogTitle>Create new bot</DialogTitle>
          <DialogDescription className="sr-only">Choose a name, a shape and a color. Everything else can be changed later in Edit bot.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-5 py-5">
          <BotIcon avatar={avatar} size={96} label="Bot preview" />
          <Input autoFocus aria-label="Bot name" className="h-10 text-center" value={name} maxLength={120} disabled={pending} placeholder="Name your bot" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault(); event.stopPropagation(); void submit();
          }} />
          <AvatarShapePicker avatar={avatar} onChange={setAvatar} size="large" />
          <AvatarColorSwatches avatar={avatar} onChange={setAvatar} size="large" customColor={false} />
        </div>
        {hostId === null ? <p role="status" className="shrink-0 px-5 pb-3 text-center text-xs text-muted-foreground">No machine is available. Connect a machine to BB before creating a bot.</p> : null}
        {error ? <p role="alert" className="max-h-20 shrink-0 overflow-y-auto px-5 pb-3 text-center text-xs text-destructive">{error}</p> : null}
        <DialogFooter className="shrink-0 gap-2 border-t border-border px-5 py-3 sm:gap-0">
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending || !ready}>{pending ? "Creating..." : "Create"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
