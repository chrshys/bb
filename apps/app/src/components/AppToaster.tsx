import { createPortal } from "react-dom";
import { Toaster, type ToasterProps } from "sonner";
import { usePreferredTheme } from "@/hooks/useTheme";

export function AppToaster(props: ToasterProps) {
  const theme = usePreferredTheme();
  if (typeof document === "undefined") return null;
  return createPortal(<Toaster theme={theme} {...props} />, document.body);
}
