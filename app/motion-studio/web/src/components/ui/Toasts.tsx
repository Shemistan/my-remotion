import { useEffect, useState } from "react";
import { t } from "../../i18n/index.js";

export type ToastTone = "info" | "success" | "error";
export interface ToastItem { id: string; message: string; tone?: ToastTone }
const EVENT = "motion-studio:toast";

export function pushToast(message: string, tone: ToastTone = "info"): void {
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT, { detail: { id: crypto.randomUUID(), message, tone } }));
}

/** Глобальная живая область; уведомление исчезает само, но его можно закрыть сразу. */
export function Toasts({ timeoutMs = 5_000 }: { timeoutMs?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const add = (event: Event) => {
      const item = (event as CustomEvent<ToastItem>).detail;
      setItems((old) => [...old, item]);
      window.setTimeout(() => setItems((old) => old.filter((x) => x.id !== item.id)), timeoutMs);
    };
    window.addEventListener(EVENT, add);
    return () => window.removeEventListener(EVENT, add);
  }, [timeoutMs]);
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <div key={item.id} className={`toast ${item.tone ?? "info"}`} role="status">
          <span>{item.message}</span>
          <button type="button" className="link" aria-label={t("ux.toast.dismiss")} onClick={() => setItems((old) => old.filter((x) => x.id !== item.id))}>×</button>
        </div>
      ))}
    </div>
  );
}
