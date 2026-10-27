import type { TKey } from "../i18n/index.js";

export type ShortcutId = "help" | "save" | "submit" | "cancel" | "play" | "frameBack" | "frameForward" | "secondBack" | "secondForward" | "sceneBack" | "sceneForward" | "undo";

export interface Shortcut {
  id: ShortcutId;
  key: string;
  display: string;
  labelKey: TKey;
  primary?: boolean;
  shift?: boolean;
}

/** Единая памятка сочетаний. Страницы могут выбирать из неё только поддерживаемые действия. */
export const SHORTCUTS: readonly Shortcut[] = [
  { id: "help", key: "?", display: "?", labelKey: "ux.shortcuts.help" },
  { id: "save", key: "s", display: "⌘ S", labelKey: "ux.shortcuts.save", primary: true },
  { id: "submit", key: "Enter", display: "⌘ Enter", labelKey: "ux.shortcuts.submit", primary: true },
  { id: "cancel", key: "Escape", display: "Esc", labelKey: "ux.shortcuts.cancel" },
  { id: "play", key: " ", display: "Space", labelKey: "ux.shortcuts.play" },
  { id: "frameBack", key: "ArrowLeft", display: "←", labelKey: "ux.shortcuts.frameBack" },
  { id: "frameForward", key: "ArrowRight", display: "→", labelKey: "ux.shortcuts.frameForward" },
  { id: "secondBack", key: "ArrowLeft", display: "Shift ←", labelKey: "ux.shortcuts.secondBack", shift: true },
  { id: "secondForward", key: "ArrowRight", display: "Shift →", labelKey: "ux.shortcuts.secondForward", shift: true },
  { id: "sceneBack", key: "[", display: "[", labelKey: "ux.shortcuts.sceneBack" },
  { id: "sceneForward", key: "]", display: "]", labelKey: "ux.shortcuts.sceneForward" },
  { id: "undo", key: "z", display: "⌘ Z", labelKey: "ux.shortcuts.undo", primary: true },
] as const;

/** Поля ввода защищены от глобальных сочетаний, включая вложенные узлы contenteditable. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  return el.matches("input, textarea, select")
    || (el instanceof HTMLElement && el.contentEditable === "true")
    || el.closest("[contenteditable]:not([contenteditable='false'])") !== null;
}

export function matchesShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">, shortcut: Shortcut): boolean {
  const primary = event.metaKey || event.ctrlKey;
  return event.key.toLowerCase() === shortcut.key.toLowerCase()
    && primary === Boolean(shortcut.primary)
    && event.shiftKey === Boolean(shortcut.shift)
    && !event.altKey;
}
