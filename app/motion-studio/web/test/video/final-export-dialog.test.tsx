// Task 45: диалог экспорта финала — FPS не таймлайна → предупреждение (F8) и fps в настройках;
// размеры разрешений от исходника; оценка места; сводка входов (без C — с причиной, не вошедшие);
// «Смонтировать и экспортировать» — POST …/revisions/2/final с Idempotency-Key; отказ гейта — карточка
// с перечнем; blocking и устаревший таймлайн — кнопка недоступна.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinalExportDialog } from "../../src/components/timeline/FinalExportDialog.js";
import { t } from "../../src/i18n/index.js";
import { fakeFetch, job, on, renderQ } from "../helpers.js";
import { timelineDto } from "./timeline-fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const EST = /\/api\/timelines\/tl_p1\/revisions\/2\/final\/estimate\?/;
const FINAL = "/api/timelines/tl_p1/revisions/2/final";
const estimate = (over: Record<string, unknown> = {}) => ({ width: 1920, height: 1080, fps: { num: 30, den: 1 }, frames: 900, bytes: 1.5 * 1024 ** 3, free_bytes: 80 * 1024 ** 3, min_free_bytes: 10 * 1024 ** 3, master_cached: false, ok: true, ...over });
const numbers = new Map([["sp_001", 1], ["sp_002", 2], ["sp_003", 3]]);

function setup(dto = timelineDto(), routes = [on("GET", EST, estimate()), on("POST", FINAL, { approval: {}, job: job({ id: "job_fin", type: "final.render", status: "pending" }) }, 202)]) {
  const f = fakeFetch(routes);
  const onStarted = vi.fn();
  renderQ(<FinalExportDialog projectId="p1" timeline={dto} display={{ width: 3840, height: 2160 }} numbers={numbers} onStarted={onStarted} onClose={() => undefined} />);
  return { ...f, onStarted };
}

describe("FinalExportDialog", () => {
  it("fps 25 на проекте 30 → предупреждение; запрос оценки и экспорта — с fps 25", async () => {
    const { calls, onStarted } = setup();
    expect(screen.queryByTestId("fps-warning")).toBeNull();
    fireEvent.change(screen.getByLabelText(t("finalExport.fps")), { target: { value: "25" } });
    expect(screen.getByTestId("fps-warning").textContent).toBe(t("finalExport.fpsWarning", { fps: "30" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("fps=25"))).toBe(true));
    const start = screen.getByRole("button", { name: t("finalExport.start") });
    await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(start);
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
    const post = calls.find((c) => c.method === "POST" && c.url === FINAL)!;
    expect(post.body).toEqual({ request: { resolution: "1080p", quality: "standard", audio_bitrate_kbps: 192, fps: { num: 25, den: 1 } } });
    expect(post.headers["idempotency-key"]).toBeTruthy();
  });

  it("fps таймлайна — без предупреждения и без fps в запросе; размеры разрешений; сводка входов и места", async () => {
    const { calls } = setup();
    const res = screen.getByLabelText(t("finalExport.resolution")) as HTMLSelectElement;
    expect([...res.options].map((o) => o.textContent)).toEqual([
      t("finalExport.resolution.source", { w: 3840, h: 2160 }),
      t("finalExport.resolution.option", { label: "2160p", w: 3840, h: 2160 }),
      t("finalExport.resolution.option", { label: "1080p", w: 1920, h: 1080 }),
      t("finalExport.resolution.option", { label: "720p", w: 1280, h: 720 }),
    ]);
    const inputs = screen.getByTestId("final-inputs").textContent ?? "";
    expect(inputs).toContain(t("finalExport.inputs.timeline", { n: 2, edl: 3, plan: 4, style: 1 }));
    expect(inputs).toContain(t("finalExport.inputs.scene", { n: 2, v: 1, state: t("finalExport.inputs.override", { reason: "черновик" }) }));
    expect(inputs).toContain(t("finalExport.inputs.excluded", { n: 3, reason: t("projectTimeline.excluded.reason.not_approved") }));
    await waitFor(() => expect(screen.getByTestId("final-space").textContent).toContain(t("finalExport.gib", { n: "1.50" })));
    expect(screen.getByTestId("final-space").textContent).toContain(t("finalExport.spaceMaster").trim());
    expect(calls.find((c) => EST.test(c.url))!.url).not.toContain("fps=");
  });

  it("места не хватит — предупреждение, кнопка недоступна", async () => {
    setup(timelineDto(), [on("GET", EST, estimate({ ok: false, free_bytes: 11 * 1024 ** 3 }))]);
    await waitFor(() => expect(screen.getByTestId("final-space").textContent).toContain(t("finalExport.spaceLow")));
    expect((screen.getByRole("button", { name: t("finalExport.start") }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("blocking в ревизии или таймлайн устарел — кнопка недоступна, причина видна", async () => {
    setup(timelineDto({}, { issues: [{ item_id: "sp_001", code: "anchor_outside", severity: "blocking", message: "слово вне сцены" }] }));
    expect(screen.getByTestId("final-blocking")).toBeTruthy();
    expect((screen.getByRole("button", { name: t("finalExport.start") }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("отказ гейта 409 — карточка с перечнем причин", async () => {
    setup(timelineDto(), [
      on("GET", EST, estimate()),
      on("POST", FINAL, { error: "approval_required", message: "…", errors: [{ code: "approval_required", detail: "C сцены sp_001 (scn_1): нет решения" }, { code: "timeline_stale", detail: "r2 устарела" }] }, 409),
    ]);
    const start = screen.getByRole("button", { name: t("finalExport.start") });
    await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(start);
    const list = await screen.findByTestId("final-gate-errors");
    expect(list.textContent).toContain(`${t("finalExport.gate.approval_required")}: C сцены sp_001 (scn_1): нет решения`);
    expect(list.textContent).toContain(t("finalExport.gate.timeline_stale"));
  });
});
