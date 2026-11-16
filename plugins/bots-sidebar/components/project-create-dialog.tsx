import { useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { useFolderChooser, type ProjectChoice, type ProjectCreationActions, type ProjectHost } from "./folder-chooser";

export function ProjectCreateDialog({ hosts, onCreateProject, onBrowseProjects, nativeFolderPicker, onCreated, onClose }: ProjectCreationActions & { hosts: ProjectHost[]; onCreated: (project: ProjectChoice) => void; onClose: () => void }) {
  const chooser = useFolderChooser({ hosts, nativeFolderPicker, onBrowseProjects, confirmLabel: "Create project", busyLabel: "Creating…", onDismiss: onClose, onChoose: async (input) => onCreated(await onCreateProject(input)) });
  const started = useRef(false);
  const choose = chooser.choose;
  useEffect(() => { if (!started.current) { started.current = true; void choose(); } }, [choose]);
  if (chooser.available && !chooser.browser) return null;
  return <Dialog open onOpenChange={(open) => { if (!open && !chooser.busy) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-sm">
      <DialogHeader><DialogTitle>Create project</DialogTitle><DialogDescription>{chooser.available ? "Choose the project's folder. It takes the folder's name." : "Connect a machine to create a project."}</DialogDescription></DialogHeader>
      {chooser.browser ?? <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Close</Button></DialogFooter>}
    </DialogContent>
  </Dialog>;
}
