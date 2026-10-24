// Баннер «Хранилище недоступно»: API отвечает 503 storage_offline (или health сообщает о
// нём). Пропадает с первым успешным ответом API; тогда же перечитываются все запросы — данные,
// не загрузившиеся без хранилища, появляются без перезагрузки страницы.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { storageStatus } from "../api/client.js";
import { t } from "../i18n/index.js";

export function StorageBanner() {
  const offline = useSyncExternalStore(storageStatus.subscribe, storageStatus.get, storageStatus.get);
  const client = useQueryClient();
  const was = useRef(offline);
  useEffect(() => {
    if (was.current && !offline) void client.invalidateQueries();
    was.current = offline;
  }, [offline, client]);
  if (!offline) return null;
  return (
    <div className="banner banner-error" role="alert">
      <strong>{t("storage.offline")}</strong>
      <span>{t("storage.offlineHint")}</span>
    </div>
  );
}
