// Баннер «Хранилище недоступно»: API отвечает 503 storage_offline (или health сообщает о
// нём). Пропадает с первым успешным ответом API.
import { useSyncExternalStore } from "react";
import { storageStatus } from "../api/client.js";
import { t } from "../i18n/index.js";

export function StorageBanner() {
  const offline = useSyncExternalStore(storageStatus.subscribe, storageStatus.get, storageStatus.get);
  if (!offline) return null;
  return (
    <div className="banner banner-error" role="alert">
      <strong>{t("storage.offline")}</strong>
      <span>{t("storage.offlineHint")}</span>
    </div>
  );
}
