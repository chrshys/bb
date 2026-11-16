import { useNavigate } from "react-router-dom";
import { useAppCommandHandler } from "@/components/commands/AppCommandProvider";
import { useSidebar } from "@/components/ui/sidebar.js";

export function BackToAppCommandHandler({ routePath }: { routePath: string }) {
  const navigate = useNavigate();
  const { isCompactViewport, setOpen, closeMobileSidebar } = useSidebar();

  useAppCommandHandler("app.back", () => {
    if (isCompactViewport) {
      closeMobileSidebar();
    } else {
      setOpen(true);
    }
    void navigate(routePath);
    return true;
  });

  return null;
}
