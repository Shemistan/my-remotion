import { useCallback, useEffect } from "react";
import { t } from "../i18n/index.js";

export interface UnsavedGuard {
  confirmLeave: () => boolean;
}

/** Защищает черновик при закрытии вкладки; для внутренних переходов возвращает `confirmLeave`. */
export function useUnsavedGuard(dirty: boolean): UnsavedGuard {
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = t("ux.unsaved.leave");
      return event.returnValue;
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);

  const confirmLeave = useCallback(() => !dirty || window.confirm(t("ux.unsaved.leave")), [dirty]);
  return { confirmLeave };
}
