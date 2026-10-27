import { useEffect, useRef, useState } from "react";
import { t } from "../../i18n/index.js";
import { isEditableTarget, matchesShortcut, SHORTCUTS } from "../../ui/shortcuts.js";

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    queueMicrotask(() => button.current?.focus());
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const help = SHORTCUTS.find((x) => x.id === "help")!;
      if (matchesShortcut(event, help)) {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape") {
        setOpen(false);
        queueMicrotask(() => button.current?.focus());
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  return (
    <>
      <button ref={button} type="button" className="shortcut-button" aria-label={t("ux.shortcuts.open")} onClick={() => setOpen(true)}>?</button>
      {open ? (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
            <h2 id="shortcuts-title">{t("ux.shortcuts.title")}</h2>
            <dl>{SHORTCUTS.map((x) => <div key={x.id}><dt><kbd>{x.display}</kbd></dt><dd>{t(x.labelKey)}</dd></div>)}</dl>
            <p className="hint">{t("ux.shortcuts.inputNote")}</p>
            <div className="row end"><button type="button" autoFocus onClick={close}>{t("ux.shortcuts.close")}</button></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
