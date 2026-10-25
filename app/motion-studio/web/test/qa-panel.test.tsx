// QAPanel: четыре gate, замечания с кадром (клик → seek), миниатюры кадров, оценки Visual QA,
// «автоматическая оценка, решение за вами», публикация с замечаниями (лучшая попытка, S5).
import type { QAReport } from "@ms/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { QAPanel } from "../src/components/QAPanel.js";
import { t } from "../src/i18n/index.js";

const report: QAReport = {
  gate: { technical: "pass", visual: "warn", semantic: "pass", style: "not_checked" },
  issues: [
    { source: "agent", code: "text_overlap", severity: "warning", frame: 72, description: "Подпись наезжает на узел", fix_hint: "сдвинуть" },
    { source: "technical", code: "probe", severity: "blocking", description: "без кадра", fix_hint: "-" },
  ],
  checked_frames: [0, 72, 149],
  ocr: [],
  scores: { overall: 6.5, hierarchy: 7, composition: 6, entrance: 6, choreography: 5, hold: 6, legibility: 8, meaning: 7 },
  automated: true,
};

it("issue frame 72 → клик вызывает seek(72); подпись «автоматическая оценка»", () => {
  const seek = vi.fn();
  render(<QAPanel versionId="v1" gate={report.gate} report={report} qaFrames={[0, 72, 149]} onSeek={seek} />);
  fireEvent.click(screen.getByRole("button", { name: t("qa.frame", { frame: 72 }) }));
  expect(seek).toHaveBeenCalledWith(72);
  expect(screen.getByText(t("qa.automated"))).toBeTruthy();
  expect(screen.getByText("Подпись наезжает на узел")).toBeTruthy();
  // код замечания — по-русски; код из данных без перевода — «замечание», сырой код в подсказке
  expect(screen.getByText(t("qa.code.text_overlap"))).toBeTruthy();
  expect(screen.queryByText("text_overlap")).toBeNull();
});

it("неизвестный код замечания не показывается латиницей", () => {
  const r: QAReport = { ...report, issues: [{ source: "agent", code: "weird_new_code", severity: "warning", description: "что-то", fix_hint: "-" }] };
  render(<QAPanel versionId="v1" gate={r.gate} report={r} qaFrames={[]} onSeek={() => undefined} />);
  expect(screen.getByText(t("qa.code.other")).getAttribute("title")).toBe("weird_new_code");
  expect(screen.queryByText("weird_new_code")).toBeNull();
});

it("четыре gate с вердиктами по-русски; visual warn — «опубликована с замечаниями»", () => {
  render(<QAPanel versionId="v1" gate={report.gate} report={report} qaFrames={[]} onSeek={() => undefined} />);
  for (const g of ["technical", "visual", "semantic", "style"] as const) expect(screen.getByText(t(`qa.gate.${g}`))).toBeTruthy();
  expect(screen.getAllByText(t("qa.verdict.pass"))).toHaveLength(2);
  expect(screen.getByText(t("qa.verdict.warn"))).toBeTruthy();
  expect(screen.getByText(t("qa.verdict.not_checked"))).toBeTruthy();
  expect(screen.getByText(t("qa.publishedWithWarnings"))).toBeTruthy();
  expect(screen.getByText(t("qa.severity.blocking"))).toBeTruthy();
});

it("оценки Visual QA: итог и оси", () => {
  render(<QAPanel versionId="v1" gate={report.gate} report={report} qaFrames={[]} onSeek={() => undefined} />);
  expect(screen.getByTestId("qa-overall").textContent).toContain("6,5");
  expect(screen.getByText(t("qa.axis.legibility"))).toBeTruthy();
});

it("миниатюры кадров QA — из API версии, клик → seek", () => {
  const seek = vi.fn();
  render(<QAPanel versionId="v1" gate={report.gate} report={report} qaFrames={[0, 149]} onSeek={seek} />);
  const imgs = screen.getAllByRole("img");
  expect(imgs.map((i) => i.getAttribute("src"))).toEqual(["/api/versions/v1/frames/0.png", "/api/versions/v1/frames/149.png"]);
  fireEvent.click(imgs[1]!);
  expect(seek).toHaveBeenCalledWith(149);
});

it("без отчёта QA — gate из manifest и пометка, что подробностей нет", () => {
  render(<QAPanel versionId="v1" gate={{ technical: "pass", visual: "not_checked", semantic: "not_checked", style: "not_checked" }} report={null} qaFrames={[]} onSeek={() => undefined} />);
  expect(screen.getByText(t("qa.noReport"))).toBeTruthy();
  expect(screen.queryByText(t("qa.publishedWithWarnings"))).toBeNull();
});
