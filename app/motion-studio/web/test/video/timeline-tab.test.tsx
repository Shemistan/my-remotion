// Task 45: вкладка «Таймлайн» — нет плана — подсказка; таймлайна нет — «Собрать таймлайн»
// (POST build с Idempotency-Key); есть — дорожки, исключённые с причиной, баннер устаревания,
// инспектор (исключение — операция include), ревизии и «вернуть эту» (операции разницы с базой),
// превью ревизии; «Изменить границы — в плане» — сцена на дорожке плана.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VideoProjectDto } from "@ms/contracts";
import { t } from "../../src/i18n/index.js";
import { TimelineTab } from "../../src/pages/video/TimelineTab.js";
import { type Call, TS, fakeFetch, job, on, renderQ } from "../helpers.js";
import { tclip, timelineDto } from "./timeline-fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const project = (plan = true) => ({
  project: { id: "p1", kind: "video", title: "Ролик", settings: null, created_at: TS, updated_at: TS },
  media: { asset: { id: "med_1", probe: { duration_us: 30_000_000, timeline_fps: { num: 30, den: 1 }, video: { display_width: 1920, display_height: 1080 } } }, derivatives: [], transcript_id: null },
  transcript: null, edl: { id: "edl_1", current_revision: 3, preview_ready: false }, approvals: { A: { state: "valid" }, B: { state: "valid" } },
  footage: null, semantic: null, plan: plan ? { id: "pln_1" } : null, style: null, jobs: [],
}) as unknown as VideoProjectDto;
const props = (plan = true) => ({ data: project(plan), currentUs: 0, onSeek: () => undefined, onChanged: () => undefined });
const TL = "/api/projects/p1/timeline";
const posts = (calls: Call[], url: string) => calls.filter((c) => c.method === "POST" && c.url === url);
const planItem = (n: number) => ({ id: `sp_00${n}`, status: "accepted", frames: { start: 300 * n, end: 300 * n + 90 } });
const base = [
  on("GET", "/api/plans/pln_1", { id: "pln_1", current_revision: 4, doc: { items: [planItem(1), planItem(2), planItem(3)] } }),
  on("GET", "/api/projects/p1/video/scenes", { project_id: "p1", plan: null, approval_b: { state: "valid" }, scenes: [], batches: [], packages: [] }),
  on("GET", "/api/projects/p1/final-exports", []),
  on("GET", "/api/timelines/tl_p1/revisions", [
    { revision: 1, parent_revision: null, created_at: TS, current: false, ops: 0, scenes: 2 },
    { revision: 2, parent_revision: 1, created_at: TS, current: true, ops: 1, scenes: 2 },
  ]),
];

describe("TimelineTab", () => {
  it("нет плана — подсказка, запросов таймлайна нет", () => {
    const { calls } = fakeFetch(base);
    renderQ(<TimelineTab {...props(false)} />);
    expect(screen.getByText(t("projectTimeline.stub"))).toBeTruthy();
    expect(calls.filter((c) => c.url === TL)).toEqual([]);
  });

  it("таймлайна нет — «Собрать таймлайн»: POST build с ключом", async () => {
    const { calls } = fakeFetch([
      on("GET", TL, { error: "timeline_not_found", message: "нет", job: null }, 404),
      on("POST", "/api/projects/p1/timeline/build", { job: job({ id: "job_b", type: "timeline.build", status: "pending" }) }, 202),
      on("GET", /\/api\/jobs\/job_b/, { job: job({ id: "job_b", type: "timeline.build", status: "pending" }), events: [], processes: [] }),
      ...base,
    ]);
    renderQ(<TimelineTab {...props()} />);
    expect(await screen.findByText(t("projectTimeline.empty"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("projectTimeline.build") }));
    await waitFor(() => expect(posts(calls, "/api/projects/p1/timeline/build")).toHaveLength(1));
    expect(posts(calls, "/api/projects/p1/timeline/build")[0]!.headers["idempotency-key"]).toBeTruthy();
  });

  it("дорожки, исключённая сцена, баннер устаревания; исключение из инспектора — include false на базе r2", async () => {
    const dto = timelineDto({ fresh: false, reasons: ["plan_changed", "version_changed"] });
    const { calls } = fakeFetch([on("GET", TL, dto), on("POST", "/api/timelines/tl_p1/revisions", timelineDto({ revision: 3 }), 201), ...base]);
    renderQ(<TimelineTab {...props()} />);
    expect(await screen.findByTestId("timeline-view")).toBeTruthy();
    for (const id of ["track-video", "track-audio", "track-graphics", "track-anchors"]) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByTestId("timeline-stale").textContent).toContain(
      t("projectTimeline.stale.text", { reasons: `${t("projectTimeline.stale.reason.plan_changed")}, ${t("projectTimeline.stale.reason.version_changed")}` }),
    );
    await waitFor(() => expect(screen.getByTestId("timeline-excluded-sp_003")).toBeTruthy());
    expect(screen.getByTestId("timeline-clip-sp_002").textContent).toContain(t("projectTimeline.clip.badgeOverride"));
    // выбор сцены → инспектор → исключить
    const el = screen.getByTestId("timeline-clip-sp_001");
    fireEvent.pointerDown(el, { button: 0, clientX: 10, pointerId: 1 });
    fireEvent.pointerUp(el, { clientX: 10, pointerId: 1 });
    const insp = await screen.findByTestId("clip-inspector");
    expect(within(insp).getByTestId("inspector-frames").textContent).toBe(t("projectTimeline.inspector.frames", { from: 300, to: 390, n: 90 }));
    // ручки длительности нет — только переход в план
    expect(within(insp).queryByRole("button", { name: /длительн/i })).toBeNull();
    fireEvent.click(within(insp).getByRole("button", { name: t("projectTimeline.inspector.exclude") }));
    await waitFor(() => expect(posts(calls, "/api/timelines/tl_p1/revisions")).toHaveLength(1));
    expect(posts(calls, "/api/timelines/tl_p1/revisions")[0]!.body).toEqual({ base_revision: 2, ops: [{ op: "include", clip_id: "clip_sp_001", include: false }] });
  });

  it("«Вернуть эту» — операции разницы r1 → r2 одной правкой", async () => {
    const r1 = timelineDto({ revision: 1 }, { revision: 1, scenes: [tclip(1, { start_frame: 290 }), tclip(2, { include: "override", override_reason: "черновик" })] }).doc;
    const { calls } = fakeFetch([
      on("GET", TL, timelineDto()), on("GET", "/api/timelines/tl_p1/revisions/1", { timeline_id: "tl_p1", revision: 1, doc: r1 }),
      on("POST", "/api/timelines/tl_p1/revisions", timelineDto({ revision: 3 }), 201), ...base,
    ]);
    renderQ(<TimelineTab {...props()} />);
    const list = await screen.findByTestId("timeline-revisions");
    await waitFor(() => expect(within(list).getByRole("button", { name: t("projectTimeline.revisions.restore") })).toBeTruthy());
    fireEvent.click(within(list).getByRole("button", { name: t("projectTimeline.revisions.restore") }));
    await waitFor(() => expect(posts(calls, "/api/timelines/tl_p1/revisions")).toHaveLength(1));
    expect(posts(calls, "/api/timelines/tl_p1/revisions")[0]!.body).toEqual({ base_revision: 2, ops: [{ op: "move", clip_id: "clip_sp_001", start_frame: 290, snap: false }] });
  });

  it("превью нет — «Собрать превью ревизии» (POST preview с ключом); есть — видео ревизии", async () => {
    const { calls } = fakeFetch([on("GET", TL, timelineDto()), on("POST", "/api/timelines/tl_p1/revisions/2/preview", { job: job({ id: "job_p", type: "timeline.preview" }) }, 202), ...base]);
    renderQ(<TimelineTab {...props()} />);
    fireEvent.click(await screen.findByRole("button", { name: t("projectTimeline.preview.build") }));
    await waitFor(() => expect(posts(calls, "/api/timelines/tl_p1/revisions/2/preview")).toHaveLength(1));
    expect(posts(calls, "/api/timelines/tl_p1/revisions/2/preview")[0]!.headers["idempotency-key"]).toBeTruthy();
  });

  it("превью готово — видео ревизии; «Изменить границы — в плане» нажимает сцену на дорожке плана", async () => {
    fakeFetch([on("GET", TL, timelineDto({ preview_ready: true })), ...base]);
    const planBtn = document.createElement("button");
    planBtn.setAttribute("data-testid", "plan-item-sp_001");
    const clicked = vi.fn();
    planBtn.addEventListener("click", clicked);
    document.body.appendChild(planBtn);
    renderQ(<TimelineTab {...props()} />);
    expect((await screen.findByTestId("timeline-preview")).getAttribute("src")).toBe("/api/timelines/tl_p1/revisions/2/preview.mp4");
    const el = screen.getByTestId("timeline-clip-sp_001");
    fireEvent.pointerDown(el, { button: 0, clientX: 10, pointerId: 1 });
    fireEvent.pointerUp(el, { clientX: 10, pointerId: 1 });
    fireEvent.click(await screen.findByRole("button", { name: t("projectTimeline.inspector.bounds") }));
    expect(clicked).toHaveBeenCalled();
    planBtn.remove();
  });
});
