// Прозрачные props сцены (S6, Р5; Task 36, Р-V5): альфа-экспорт ProRes 4444 из непрозрачной версии
// и прозрачные размещения таймлайна (`overlay`, `callout`, `split_screen`, `pip`) рендерят ту же
// версию с `props.style.transparent = true` — Background kit не рисуется, фон корня не ставится.
// Код сцены не меняется: прозрачность — только через договор `ScenePropsBase`.
import { ScenePropsBaseSchema } from "@ms/contracts";

/**
 * Props версии с `style.transparent = true` (вход не меняется); props вне договора
 * `ScenePropsBase` (срез, импорт) фон через props не отключают — `{ error: "overlay_unsupported" }`.
 */
export function overlayInputProps(props: Record<string, unknown>): Record<string, unknown> | { error: "overlay_unsupported" } {
  if (!ScenePropsBaseSchema.safeParse(props).success) return { error: "overlay_unsupported" };
  return { ...props, style: { ...(props.style as Record<string, unknown>), transparent: true } };
}

/** Результат `overlayInputProps` — отказ. */
export function isOverlayUnsupported(r: Record<string, unknown> | { error: "overlay_unsupported" }): r is { error: "overlay_unsupported" } {
  return (r as { error?: unknown }).error === "overlay_unsupported" && Object.keys(r).length === 1;
}
