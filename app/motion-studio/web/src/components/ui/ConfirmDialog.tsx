import { type ReactNode, useEffect, useId, useRef } from "react";
import { t } from "../../i18n/index.js";

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = t("ux.confirm.cancel"), danger = false, busy = false, confirmDisabled = false, children, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirm.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [open, busy, onCancel]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} aria-describedby={`${uid}-description`}>
        <h2 id={`${uid}-title`}>{title}</h2>
        <div id={`${uid}-description`}>{description}</div>
        {children}
        <div className="row end">
          <button type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirm} type="button" className={danger ? "danger" : "primary"} disabled={busy || confirmDisabled} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
