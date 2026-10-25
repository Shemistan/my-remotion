// Переименование на месте (Task 47): поле вместо названия в списке; Enter — сохранить, Escape —
// отмена. Название 1–120 символов после trim проверяет сервер (`invalid_title`).
import { useState } from "react";
import { useRename } from "../../api/projects-client.js";
import { errorText, t } from "../../i18n/index.js";

export interface RenameDialogProps {
  id: string;
  title: string;
  onClose: () => void;
}

export function RenameDialog({ id, title, onClose }: RenameDialogProps) {
  const [value, setValue] = useState(title);
  const rename = useRename(onClose);
  const submit = () => {
    if (value.trim() === title) return onClose();
    rename.mutate({ id, title: value });
  };
  return (
    <form className="row wrap grow" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input
        className="grow"
        aria-label={t("projects.renameLabel")}
        value={value}
        maxLength={120}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      />
      <button type="submit" className="primary" disabled={!value.trim() || rename.isPending}>{t("common.save")}</button>
      <button type="button" onClick={onClose}>{t("common.cancel")}</button>
      {rename.isError ? <p className="error">{errorText(rename.error)}</p> : null}
    </form>
  );
}
