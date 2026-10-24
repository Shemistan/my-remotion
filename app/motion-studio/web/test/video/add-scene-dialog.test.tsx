// AddSceneDialog (Task 33): сцена пользователя по выделенным словам — тип, режим, зона, назначение
// (обязательно) → операция `add`.
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AddSceneDialog } from "../../src/components/video/AddSceneDialog.js";
import { t } from "../../src/i18n/index.js";

it("назначение обязательно; «Добавить» — операция add с выбранными полями; Escape/«Отмена» — закрыть", () => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(<AddSceneDialog range={{ start_word_id: "w_000004", end_word_id: "w_000005", text: "как дела" }} busy={false} onSubmit={onSubmit} onClose={onClose} />);
  expect(screen.getByRole("dialog").textContent).toContain(t("addScene.words", { text: "как дела" }));
  const add = screen.getByRole("button", { name: t("addScene.submit") });
  expect(add).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByRole("combobox", { name: t("addScene.type") }), { target: { value: "comparison" } });
  fireEvent.change(screen.getByRole("combobox", { name: t("addScene.mode") }), { target: { value: "callout" } });
  fireEvent.change(screen.getByRole("combobox", { name: t("addScene.zone") }), { target: { value: "right_third" } });
  fireEvent.change(screen.getByRole("textbox", { name: t("addScene.purpose") }), { target: { value: "сравнить" } });
  fireEvent.click(add);
  expect(onSubmit).toHaveBeenCalledWith({
    op: "add", start_word_id: "w_000004", end_word_id: "w_000005", visual_type: "comparison", composition_mode: "callout", zone: "right_third", purpose: "сравнить",
  });
  fireEvent.click(screen.getByRole("button", { name: t("common.cancel") }));
  expect(onClose).toHaveBeenCalled();
});
