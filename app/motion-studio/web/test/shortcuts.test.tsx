import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ShortcutsHelp } from "../src/components/ui/ShortcutsHelp.js";
import { t } from "../src/i18n/index.js";
import { SHORTCUTS, isEditableTarget, matchesShortcut } from "../src/ui/shortcuts.js";

it("реестр сочетаний не содержит дублей и использует ключи словаря", () => {
  expect(SHORTCUTS.length).toBeGreaterThanOrEqual(4);
  expect(new Set(SHORTCUTS.map((x) => x.id)).size).toBe(SHORTCUTS.length);
  for (const x of SHORTCUTS) expect(t(x.labelKey)).toBeTruthy();
});

it("глобальные клавиши не срабатывают в полях ввода", () => {
  const input = document.createElement("input");
  const area = document.createElement("textarea");
  const editable = document.createElement("div");
  editable.contentEditable = "true";
  expect(isEditableTarget(input)).toBe(true);
  expect(isEditableTarget(area)).toBe(true);
  expect(isEditableTarget(editable)).toBe(true);
  expect(isEditableTarget(document.body)).toBe(false);
  expect(matchesShortcut(new KeyboardEvent("keydown", { key: "?" }), SHORTCUTS[0]!)).toBe(true);
});

it("справка открывается по ? вне поля, закрывается по Escape и возвращает фокус", async () => {
  render(<ShortcutsHelp />);
  const button = screen.getByRole("button", { name: t("ux.shortcuts.open") });
  button.focus();
  fireEvent.keyDown(document, { key: "?" });
  expect(screen.getByRole("dialog", { name: t("ux.shortcuts.title") })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  await Promise.resolve();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(button);

  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  fireEvent.keyDown(input, { key: "?" });
  expect(screen.queryByRole("dialog")).toBeNull();
  input.remove();
});
