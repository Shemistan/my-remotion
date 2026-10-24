// Ревью Task 33 I1: смысловой анализ и план по умолчанию — с агентом (выкл — осознанный выбор);
// разметка без агента помечена в UI; построение плана с агентом поверх сцен — с подтверждением.
import type { VideoProjectDto } from "@ms/contracts";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AnalysisPanel } from "../../src/components/video/AnalysisPanel.js";
import { PlanPanel } from "../../src/components/video/PlanPanel.js";
import { t } from "../../src/i18n/index.js";
import { TS, fakeFetch, job, on, renderQ } from "../helpers.js";
import { WORDS, edlDto, transcriptDto } from "./fixtures.js";
import { item, planDto, semantic } from "./plan-fixtures.js";

afterEach(() => vi.unstubAllGlobals());

function video(over: Partial<VideoProjectDto> = {}): VideoProjectDto {
  return {
    project: { id: "p1", kind: "video", title: "Видео", settings: null, created_at: TS, updated_at: TS },
    media: null, transcript: { id: "trn_1", current_revision: 1 }, edl: { id: "edl_1", current_revision: 1, preview_ready: true },
    approvals: { A: { state: "valid" }, B: { state: "missing" } } as VideoProjectDto["approvals"],
    footage: { id: "ftg_1", mode: "vision" }, semantic: { id: "sem_1", fresh: true }, plan: null, style: null, jobs: [], ...over,
  };
}
const created = { job: job({ type: "plan.visual", status: "pending" }) };

it("смысловой анализ: «С агентом» включён по умолчанию — запуск с useAgent: true", async () => {
  const { calls } = fakeFetch([on("POST", "/api/projects/p1/semantic/analyze", created, 202)]);
  renderQ(<AnalysisPanel data={video({ semantic: null })} words={WORDS} currentUs={0} onSeek={vi.fn()} onJob={vi.fn()} />);
  const section = screen.getByRole("region", { name: t("analysis.semantic") });
  expect((section.querySelector("input[type=checkbox]") as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: t("analysis.runSemantic") }));
  await waitFor(() => expect(calls.find((c) => c.url.endsWith("/semantic/analyze"))?.body).toEqual({ useAgent: true }));
});

it("разметка без агента — пометка «пустая, без агента»", async () => {
  fakeFetch([on("GET", "/api/semantic/sem_1", { semantic: semantic({ chapters: [], anchors: [], numbers: [], disputed: [], agent: "skipped" }) })]);
  renderQ(<AnalysisPanel data={video()} words={WORDS} currentUs={0} onSeek={vi.fn()} onJob={vi.fn()} />);
  expect(await screen.findByText(t("analysis.semanticSkipped"))).toBeTruthy();
});

it("ревью Task 33 M1: старая пустая разметка без поля agent — тоже пометка «без агента»", async () => {
  fakeFetch([on("GET", "/api/semantic/sem_1", { semantic: semantic({ chapters: [], anchors: [], numbers: [], disputed: [] }) })]);
  renderQ(<AnalysisPanel data={video()} words={WORDS} currentUs={0} onSeek={vi.fn()} onJob={vi.fn()} />);
  expect(await screen.findByText(t("analysis.semanticSkipped"))).toBeTruthy();
});

const planProps = (plan: ReturnType<typeof planDto> | undefined, current?: { current_revision: number; scenes: number }) => ({
  data: video({ plan: plan ? { id: "pln_1", current_revision: 1, scenes: plan.doc.items.length, ...current } : null }), edl: edlDto(), transcript: transcriptDto(), plan, styleIssues: [],
  selected: undefined, onSelect: vi.fn(), onPreviewZone: vi.fn(), onPlayEdited: vi.fn(), onSeek: vi.fn(), currentUs: 0, onChanged: vi.fn(),
});

it("план: «С агентом» включён по умолчанию; без сцен — построение сразу", async () => {
  const { calls } = fakeFetch([on("POST", "/api/projects/p1/plan/generate", created, 202)]);
  renderQ(<PlanPanel {...planProps(undefined)} />);
  expect((screen.getByRole("checkbox", { name: t("analysis.useAgent") }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: t("plan.generate") }));
  await waitFor(() => expect(calls.find((c) => c.url.endsWith("/plan/generate"))?.body).toEqual({ useAgent: true }));
});

it("план со сценами: построение с агентом — только после подтверждения замены", async () => {
  const { calls } = fakeFetch([on("POST", "/api/projects/p1/plan/generate", created, 202)]);
  renderQ(<PlanPanel {...planProps(planDto([item()]))} />);
  fireEvent.click(screen.getByRole("button", { name: t("plan.generate") }));
  expect(screen.getByRole("alertdialog").textContent).toContain(t("plan.replaceWarning"));
  expect(calls.some((c) => c.url.endsWith("/plan/generate"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: t("common.cancel") }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("plan.generate") }));
  fireEvent.click(screen.getByRole("button", { name: t("plan.replaceConfirm") }));
  await waitFor(() => expect(calls.find((c) => c.url.endsWith("/plan/generate"))?.body).toEqual({ useAgent: true }));
});

it("ревью Task 33 M4: подтверждение замены — по сценам текущей ревизии (как сервер), а не показанной", async () => {
  const { calls } = fakeFetch([on("POST", "/api/projects/p1/plan/generate", created, 202)]);
  // показана r1 без сцен, текущая r2 — со сценами: подтверждение нужно
  const view = renderQ(<PlanPanel {...planProps(planDto([]), { current_revision: 2, scenes: 1 })} />);
  fireEvent.click(screen.getByRole("button", { name: t("plan.generate") }));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  view.unmount();
  // показана r1 со сценой, текущая r2 — без сцен: построение сразу
  renderQ(<PlanPanel {...planProps(planDto([item()]), { current_revision: 2, scenes: 0 })} />);
  fireEvent.click(screen.getByRole("button", { name: t("plan.generate") }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await waitFor(() => expect(calls.some((c) => c.url.endsWith("/plan/generate"))).toBe(true));
});
