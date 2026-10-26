// Ошибка маршрутов сцен видеопроекта (Task 40, ревью): карточка каталога ошибок (Task 48) —
// подсказка и действия каталога, технические подробности; заголовок — из словаря области, если у
// кода там свой текст (B вместо A, plan_changed …). 409 `nothing_to_generate` — не ошибка, а
// нейтральная подсказка: всё уже готово.
import { ApiError } from "../../api/client.js";
import { hasKey, t } from "../../i18n/index.js";
import { ErrorCard } from "../diagnostics/ErrorCard.js";

export function VideoScenesError({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.code === "nothing_to_generate") {
    return <p className="hint" role="status" data-testid="generate-note">{t("videoScenes.error.nothing_to_generate")}</p>;
  }
  const code = error instanceof ApiError ? error.code : "network";
  const message = error instanceof Error ? error.message : "";
  const own = `videoScenes.error.${code}`;
  return <ErrorCard error={{ error: code, message }} {...(hasKey(own) ? { title: t(own) } : {})} />;
}
