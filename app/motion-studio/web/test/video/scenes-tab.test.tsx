// Task 40: вкладка «Сцены» видеопроекта — плитки по статусам и Approval C (подписи словаря),
// «Сгенерировать все» / «Повторить» / «Перегенерировать» (тело и Idempotency-Key), B не утверждено,
// «сцена устарела», отмена пакета, превью в контексте («Собрать», «Перерисовать», видео).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/index.js";
import { ScenesTab } from "../../src/pages/video/ScenesTab.js";
import { versionDto } from "../fixtures.js";
import { type Call, fakeFetch, job, on, renderQ } from "../helpers.js";
import { approvalC, projectDto, scenesState, vbatch, vscene } from "./scenes-fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const STATE = "/api/projects/p1/video/scenes";
const GEN = "/api/projects/p1/video/generate";
const posts = (calls: Call[], url: string) => calls.filter((c) => c.method === "POST" && c.url === url);
const tiles = () => screen.getAllByTestId("video-scene-tile");
const props = (plan = true) => ({ data: projectDto(plan), currentUs: 0, onSeek: () => undefined, onChanged: () => undefined });
const base = (state = scenesState()) => [
  on("GET", STATE, state),
  on("GET", /\/api\/versions\/ver_\d$/, versionDto("ver_1", 1)),
  on("GET", /\/api\/jobs\//, { job: job({ id: "job_2", status: "running" }), events: [], processes: [] }),
  on("POST", GEN, vbatch([]), 202),
  on("POST", "/api/video-batches/vb_1/cancel", vbatch([])),
  on("POST", /\/preview-context$/, { job: job({ id: "job_ctx", type: "scene.preview_context", status: "pending" }) }, 202),
];

it("нет плана — подсказка про план, запросов состояния нет", () => {
  const { calls } = fakeFetch(base());
  renderQ(<ScenesTab {...props(false)} />);
  expect(screen.getByText(t("videoScenes.stub"))).toBeTruthy();
  expect(calls.filter((c) => c.url === STATE)).toEqual([]);
});

it("плитки по статусам: подписи словаря, режим и зона, кадры; без кодов и undefined", async () => {
  fakeFetch(base());
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(4));
  expect(tiles().map((x) => x.getAttribute("data-status"))).toEqual(["ready", "running", "failed", "none"]);
  const labels = ["ready", "running", "failed", "none"] as const;
  tiles().forEach((x, i) => expect(x.textContent).toContain(t(`videoScenes.status.${labels[i]!}`)));
  expect(tiles()[0]!.textContent).toContain(t("videoScenes.placement", { mode: t("plan.mode.overlay"), zone: t("zone.left_third") }));
  expect(tiles()[0]!.textContent).toContain("«цитата 1»");
  expect(tiles()[2]!.textContent).toContain(t("job.failedAt", { stage: t("stage.engineer") }));
  // «Доработать» — Playground сцены; у сцены без генерации — нет
  expect(within(tiles()[0]!).getByRole("link", { name: t("videoScenes.refine") }).getAttribute("href")).toBe("/scenes/scn_1");
  expect(within(tiles()[3]!).queryByRole("link", { name: t("videoScenes.refine") })).toBeNull();
  await waitFor(() => expect(tiles()[0]!.querySelector("video")?.getAttribute("src")).toBe("/api/versions/ver_1/preview.mp4"));
  const all = document.body.textContent!;
  expect(all).not.toMatch(/undefined|NaN|\bnull\b/);
  for (const code of ["sp_00", "playground.generate", "left_third", "overlay"]) expect(all).not.toContain(code);
});

it("C: missing / valid (утверждена v1, текущая v2) / stale (plan_changed) — подписи словаря", async () => {
  const scenes = [
    vscene("sp_001", "ready"),
    vscene("sp_002", "ready", { version_id: "ver_2", version_number: 2, approval: approvalC("valid", { version_id: "ver_1", version_number: 1 }), approved_version_id: "ver_1", approved_version_number: 1 }),
    vscene("sp_003", "ready", { approval: approvalC("stale", { version_id: "ver_3", version_number: 1, reason: "plan_changed" }) }),
  ];
  fakeFetch(base(scenesState({ scenes, batches: [] })));
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(3));
  const badge = (i: number) => within(tiles()[i]!).getByTestId("approval-c-badge").textContent;
  expect(badge(0)).toBe(t("videoScenes.c.missing"));
  expect(badge(1)).toBe(t("videoScenes.c.validCurrent", { n: 1, current: 2 }));
  expect(badge(2)).toBe(t("videoScenes.c.staleReason.plan_changed"));
  // у всех трёх текущая версия не утверждена — «Утвердить (C)» есть
  for (const i of [0, 1, 2]) expect(within(tiles()[i]!).getByRole("button", { name: t("videoScenes.c.approve") })).toBeTruthy();
});

it("«Повторить» — generate { item_ids }, «Перегенерировать» — { regenerate: true }; ключи есть, повтор того же — тот же ключ", async () => {
  const { calls } = fakeFetch(base());
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(4));
  fireEvent.click(within(tiles()[2]!).getByRole("button", { name: t("videoScenes.retry") }));
  await waitFor(() => expect(posts(calls, GEN)).toHaveLength(1));
  expect(posts(calls, GEN)[0]!.body).toEqual({ revision: 2, item_ids: ["sp_003"] });
  fireEvent.click(within(tiles()[0]!).getByRole("button", { name: t("videoScenes.regenerate") }));
  await waitFor(() => expect(posts(calls, GEN)).toHaveLength(2));
  expect(posts(calls, GEN)[1]!.body).toEqual({ revision: 2, item_ids: ["sp_001"], regenerate: true });
  fireEvent.click(within(tiles()[0]!).getByRole("button", { name: t("videoScenes.regenerate") }));
  await waitFor(() => expect(posts(calls, GEN)).toHaveLength(3));
  const keys = posts(calls, GEN).map((c) => c.headers["idempotency-key"]);
  expect(keys.every(Boolean)).toBe(true);
  expect(keys[1]).toBe(keys[2]);
  expect(keys[0]).not.toBe(keys[1]);
  // у идущей и несгенерированной — ни «Повторить», ни «Перегенерировать»
  for (const i of [1, 3]) {
    expect(within(tiles()[i]!).queryByRole("button", { name: t("videoScenes.retry") })).toBeNull();
    expect(within(tiles()[i]!).queryByRole("button", { name: t("videoScenes.regenerate") })).toBeNull();
  }
});

it("«Сгенерировать все» — generate { revision }; сцена stale — значок и «Перегенерировать» выделена", async () => {
  const s = scenesState();
  const stale = scenesState({ scenes: s.scenes.map((x) => (x.item_id === "sp_001" ? { ...x, stale: true } : x)) });
  const { calls } = fakeFetch(base(stale));
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(4));
  expect(within(tiles()[0]!).getByText(t("videoScenes.stale"))).toBeTruthy();
  expect(within(tiles()[1]!).queryByText(t("videoScenes.stale"))).toBeNull();
  expect(within(tiles()[0]!).getByRole("button", { name: t("videoScenes.regenerate") }).className).toContain("primary");
  fireEvent.click(screen.getByRole("button", { name: t("videoScenes.generateAll") }));
  await waitFor(() => expect(posts(calls, GEN)).toHaveLength(1));
  expect(posts(calls, GEN)[0]!.body).toEqual({ revision: 2 });
  expect(posts(calls, GEN)[0]!.headers["idempotency-key"]).toMatch(/^video-all:r2:/);
});

it("B не утверждено — подсказка, «Сгенерировать все» недоступна, запросов нет", async () => {
  const { calls } = fakeFetch([
    on("POST", GEN, { error: "approval_required", message: "план не утверждён" }, 409),
    ...base(scenesState({ approval_b: { state: "missing" } })),
  ]);
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(screen.getByText(t("videoScenes.needB"))).toBeTruthy());
  expect((screen.getByRole("button", { name: t("videoScenes.generateAll") }) as HTMLButtonElement).disabled).toBe(true);
  expect(calls.filter((c) => c.method === "POST")).toEqual([]);
});

it("ошибка генерации 409 approval_required — текст словаря области", async () => {
  fakeFetch([on("POST", GEN, { error: "approval_required", message: "x" }, 409), ...base()]);
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(4));
  fireEvent.click(screen.getByRole("button", { name: t("videoScenes.generateAll") }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(t("videoScenes.error.approval_required")));
});

it("пакет: прогресс и «Отменить пакет» → cancel пакета видеосцен", async () => {
  const { calls } = fakeFetch(base());
  renderQ(<ScenesTab {...props()} />);
  const bar = await screen.findByTestId("batch-bar");
  expect(bar.textContent).toContain(t("scriptOutput.batch.progress", { ready: 1, total: 3 }));
  fireEvent.click(within(bar).getByRole("button", { name: t("scriptOutput.batch.cancel") }));
  await waitFor(() => expect(posts(calls, "/api/video-batches/vb_1/cancel")).toHaveLength(1));
  expect(calls.filter((c) => c.url.includes("/api/script-batches/"))).toEqual([]);
});

it("«В контексте»: нет превью — «Собрать» (POST preview-context с ключом); устарело — видео и «Перерисовать»", async () => {
  const scenes = [
    vscene("sp_001", "ready"),
    vscene("sp_002", "ready", { version_id: "ver_2", context_preview: { version_id: "ver_2", rel_path: "x/preview.mp4", plan_revision: 1, pad_frames: 30, outdated: true } }),
  ];
  const { calls } = fakeFetch(base(scenesState({ scenes, batches: [] })));
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(2));
  fireEvent.click(within(tiles()[0]!).getByRole("tab", { name: t("videoScenes.view.context") }));
  expect(within(tiles()[0]!).getByText(t("videoScenes.context.none"))).toBeTruthy();
  fireEvent.click(within(tiles()[0]!).getByRole("button", { name: t("videoScenes.context.build") }));
  await waitFor(() => expect(posts(calls, "/api/scenes/scn_1/preview-context")).toHaveLength(1));
  const call = posts(calls, "/api/scenes/scn_1/preview-context")[0]!;
  expect(call.body).toEqual({ version_id: "ver_1" });
  expect(call.headers["idempotency-key"]).toBeTruthy();

  fireEvent.click(within(tiles()[1]!).getByRole("tab", { name: t("videoScenes.view.context") }));
  const video = within(tiles()[1]!).getByTestId("context-video");
  expect(video.getAttribute("src")).toBe("/api/scenes/scn_2/preview-context.mp4?versionId=ver_2");
  expect(within(tiles()[1]!).getByText(t("videoScenes.context.outdated"))).toBeTruthy();
  expect(within(tiles()[1]!).getByRole("button", { name: t("videoScenes.context.rebuild") })).toBeTruthy();
});
