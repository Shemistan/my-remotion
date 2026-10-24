// PlanInspector (Task 33): поля сцены, перекрытие лица > 2 % — причина обязательна и «Принять»
// без неё недоступна; действия — операции правки плана; «Вернуть к предложению» агента; проблемы сцены.
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PlanInspector } from "../../src/components/video/PlanInspector.js";
import { PlanIssues } from "../../src/components/video/PlanIssues.js";
import { t } from "../../src/i18n/index.js";
import { edlDto } from "./fixtures.js";
import { item } from "./plan-fixtures.js";

const tl = edlDto().timeline;
const base = { timeline: tl, issues: [], busy: false, onPlay: vi.fn(), onPreviewZone: vi.fn() };

it("перекрытие лица 0,56 без причины: поле «причина» обязательно, «Принять» недоступна; с текстом — причина и принятие одной правкой", () => {
  const onOps = vi.fn();
  const x = item({ zone: "right_third", face_overlap: { ratio: 0.56 } });
  render(<PlanInspector {...base} item={x} onOps={onOps} />);
  expect(screen.getByTestId("inspector").textContent).toContain(t("inspector.face", { pct: 56 }));
  const reason = screen.getByRole("textbox", { name: t("inspector.reason") });
  expect(reason).toHaveProperty("required", true);
  const accept = screen.getByRole("button", { name: t("inspector.accept") });
  expect(accept).toHaveProperty("disabled", true);
  fireEvent.change(reason, { target: { value: "  " } });
  expect(accept).toHaveProperty("disabled", true);
  fireEvent.change(reason, { target: { value: "автор показывает на схему" } });
  expect(accept).toHaveProperty("disabled", false);
  fireEvent.click(accept);
  expect(onOps).toHaveBeenCalledWith([
    { op: "modify", item_id: "sp_001", patch: { override_reason: "автор показывает на схему" } },
    { op: "set_status", item_id: "sp_001", status: "accepted" },
  ]);
});

it("без перекрытия: поля сцены, ключевые слова с моментом, оценки; Принять/Отклонить — set_status; смена зоны — modify и превью", () => {
  const onOps = vi.fn();
  const onPreviewZone = vi.fn();
  render(<PlanInspector {...base} onPreviewZone={onPreviewZone} item={item()} onOps={onOps} />);
  const text = screen.getByTestId("inspector").textContent ?? "";
  expect(text).toContain("показать приветствие");
  expect(text).toContain(t("pattern.key-point-emphasis"));
  expect(text).toContain(t("plan.mode.overlay"));
  expect(text).toContain(t("inspector.keyTerm", { text: "мир", tc: "00:00:00.50" }));
  expect(text).toContain("рукопожатие");
  expect(text).toContain(t("inspector.scores", { c: 2, u: 4, e: 2, l: 3 }));
  expect(screen.queryByRole("textbox", { name: t("inspector.reason") })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("inspector.accept") }));
  expect(onOps).toHaveBeenLastCalledWith([{ op: "set_status", item_id: "sp_001", status: "accepted" }]);
  fireEvent.click(screen.getByRole("button", { name: t("inspector.reject") }));
  expect(onOps).toHaveBeenLastCalledWith([{ op: "set_status", item_id: "sp_001", status: "rejected" }]);
  const zone = screen.getByRole("combobox", { name: t("inspector.zone") });
  fireEvent.focus(zone);
  expect(onPreviewZone).toHaveBeenLastCalledWith("left_third");
  fireEvent.change(zone, { target: { value: "lower_third" } });
  expect(onPreviewZone).toHaveBeenLastCalledWith("lower_third");
  expect(onOps).toHaveBeenLastCalledWith([{ op: "modify", item_id: "sp_001", patch: { zone: "lower_third" } }]);
});

it("«Изменить» — назначение, тип и режим одной правкой; «Вернуть к предложению» — поля агента, только если они изменены", () => {
  const onOps = vi.fn();
  const proposal = { visual_type: "comparison" as const, composition_mode: "overlay" as const, zone: "right_third" as const, start_word_id: "w_000001", end_word_id: "w_000002" };
  const { rerender } = render(<PlanInspector {...base} item={item()} proposal={proposal} onOps={onOps} />);
  fireEvent.click(screen.getByRole("button", { name: t("inspector.revert") }));
  expect(onOps).toHaveBeenLastCalledWith([{ op: "modify", item_id: "sp_001", patch: { visual_type: "comparison", zone: "right_third" } }]);

  fireEvent.click(screen.getByRole("button", { name: t("inspector.edit") }));
  fireEvent.change(screen.getByRole("textbox", { name: t("inspector.purpose") }), { target: { value: "сравнить два варианта" } });
  fireEvent.change(screen.getByRole("combobox", { name: t("inspector.type") }), { target: { value: "comparison" } });
  fireEvent.change(screen.getByRole("combobox", { name: t("inspector.mode") }), { target: { value: "callout" } });
  fireEvent.click(screen.getByRole("button", { name: t("inspector.save") }));
  expect(onOps).toHaveBeenLastCalledWith([{ op: "modify", item_id: "sp_001", patch: { purpose: "сравнить два варианта", visual_type: "comparison", composition_mode: "callout" } }]);

  rerender(<PlanInspector {...base} item={item({ visual_type: "comparison", zone: "right_third" })} proposal={proposal} onOps={onOps} />);
  expect(screen.queryByRole("button", { name: t("inspector.revert") })).toBeNull();
});

it("устаревшая сцена — причина; «Принять» у stale(anchor_cut) недоступна; проблемы сцены — с переводом кода", () => {
  const x = item({ status: "stale", stale_reason: "anchor_cut" });
  const issues = [{ item_id: "sp_001", code: "face_overlap", severity: "blocking" as const, message: "графика закрывает 56 % лица" }];
  render(<PlanInspector {...base} item={x} issues={issues} onOps={vi.fn()} />);
  expect(screen.getByTestId("inspector").textContent).toContain(t("plan.staleReason.anchor_cut"));
  expect(screen.getByRole("button", { name: t("inspector.accept") })).toHaveProperty("disabled", true);
  expect(screen.getByTestId("inspector").textContent).toContain(t("plan.issue.face_overlap"));
});

it("PlanIssues: блокирующие сверху, неизвестный код — сообщение сервера; клик по сцене — выбор", () => {
  const onSelect = vi.fn();
  render(<PlanIssues issues={[
    { code: "tight_gap", severity: "warning", message: "промежуток 0,2 с", item_id: "sp_002" },
    { code: "density", severity: "blocking", message: "графика занимает 55 %" },
    { code: "new_code", severity: "warning", message: "что-то новое" },
  ]} onSelect={onSelect} />);
  const rows = screen.getAllByRole("listitem");
  expect(rows[0]!.textContent).toContain(t("plan.issue.density"));
  expect(rows[0]!.textContent).toContain(t("plan.severity.blocking"));
  expect(rows.map((r) => r.textContent).join(" ")).toContain("что-то новое");
  fireEvent.click(screen.getByRole("button", { name: "sp_002" }));
  expect(onSelect).toHaveBeenCalledWith("sp_002");
});
