// Task 40: вкладка «Сцены» видеопроекта — плитки по статусам и Approval C (подписи словаря),
// «Сгенерировать все» / «Повторить» / «Перегенерировать» (тело и Idempotency-Key), B не утверждено,
// «сцена устарела», отмена пакета, превью в контексте («Собрать», «Перерисовать», видео).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/index.js";
import { ScenesTab } from "../../src/pages/video/ScenesTab.js";
import { versionDto } from "../fixtures.js";
import { type Call, fakeFetch, job, on, renderQ } from "../helpers.js";
import { videoAllKey, videoBatchKey } from "../../src/api/video-scenes-client.js";
import type { VideoScenesStateDto } from "@ms/contracts";
import { approvalC, projectDto, scenesState, vbatch, vscene } from "./scenes-fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const STATE = "/api/projects/p1/video/scenes";
const GEN = "/api/projects/p1/video/generate";
const posts = (calls: Call[], url: string) => calls.filter((c) => c.method === "POST" && c.url === url);
const tiles = () => screen.getAllByTestId("video-scene-tile");
/** «Сгенерировать все» и подтверждение, если оно спрошено (ревью S21: N ≥ 2). */
const genAll = () => {
  fireEvent.click(screen.getByRole("button", { name: t("videoScenes.generateAll") }));
  const go = screen.queryByRole("button", { name: t("videoScenes.confirmGo") });
  if (go) fireEvent.click(go);
};
const props = (plan = true) => ({ data: projectDto(plan), currentUs: 0, onSeek: () => undefined, onChanged: () => undefined });
const base = (state = scenesState()) => [
  on("GET", STATE, state),
  on("GET", /\/api\/versions\/ver_\d$/, versionDto("ver_1", 1)),
  on("GET", /\/api\/jobs\//, { job: job({ id: "job_2", status: "running" }), events: [], processes: [] }),
  on("POST", GEN, vbatch([]), 202),
  on("POST", /\/api\/scenes\/scn_\d\/improve$/, { job: job({ id: "job_improve", type: "playground.edit", status: "pending" }) }, 202),
  on("POST", "/api/video-batches/vb_1/cancel", vbatch([])),
  on("POST", /\/preview-context$/, { job: job({ id: "job_ctx", type: "scene.preview_context", status: "pending" }) }, 202),
];

it("оценка показывает кнопку «Улучшить»; без оценки кнопки нет", async () => {
  const withScore = scenesState({ scenes: [vscene("sp_001", "ready", { qa_overall: 5.5 }), vscene("sp_002", "ready")] });
  const { calls } = fakeFetch(base(withScore));
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(2));
  const first = within(tiles()[0]!);
  expect(first.getByText(t("videoScenes.score", { score: 5.5 }))).toBeTruthy();
  expect(within(tiles()[1]!).queryByRole("button", { name: t("videoScenes.improve") })).toBeNull();
  fireEvent.click(first.getByRole("button", { name: t("videoScenes.improve") }));
  await waitFor(() => expect(posts(calls, "/api/scenes/scn_1/improve")).toHaveLength(1));
  expect(posts(calls, "/api/scenes/scn_1/improve")[0]!.body).toEqual({ base_version_id: "ver_1" });
});

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
  genAll();
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

it("ошибка генерации 409 approval_required — карточка ошибки (каталог 48) с текстом словаря области", async () => {
  fakeFetch([on("POST", GEN, { error: "approval_required", message: "x" }, 409), ...base()]);
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(4));
  genAll();
  const card = await screen.findByRole("alert");
  expect(card.getAttribute("data-error-code")).toBe("approval_required");
  expect(card.querySelector(".error-title")!.textContent).toBe(t("videoScenes.error.approval_required"));
  expect(within(card).getByText(t("diagnostics.action.reapprove"))).toBeTruthy();
});

it("409 nothing_to_generate — нейтральная подсказка, не ошибка", async () => {
  fakeFetch([on("POST", GEN, { error: "nothing_to_generate", message: "x" }, 409), ...base()]);
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(4));
  genAll();
  await waitFor(() => expect(screen.getByTestId("generate-note").textContent).toBe(t("videoScenes.error.nothing_to_generate")));
  expect(screen.getByTestId("generate-note").className).not.toContain("error");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("I1: полный пакет при двух готовых сценах вне пакета — «Готово 2 из 3» и «Не вошли» из состояния (без запроса)", async () => {
  const scenes = [vscene("sp_001", "ready"), vscene("sp_002", "ready"), vscene("sp_003", "running")];
  const full = { ...vbatch([scenes[2]!]), full: true };
  const { calls } = fakeFetch(base(scenesState({ scenes, batches: [full] })));
  renderQ(<ScenesTab {...props()} />);
  const bar = await screen.findByTestId("batch-bar");
  expect(bar.textContent).toContain(t("scriptOutput.batch.progress", { ready: 2, total: 3 }));
  const reason = t("videoScenes.skipReason.ready_version");
  expect(screen.getByTestId("skipped").textContent).toBe(
    t("videoScenes.skipped", { list: [1, 2].map((n) => t("videoScenes.skippedItem", { n, reason })).join("; ") }),
  );
  expect(calls.filter((c) => c.method === "POST")).toEqual([]);
});

it("I1: частичный пакет и пакет прежней ревизии — готовые вне пакета не досчитываются, «Не вошли» нет", async () => {
  const scenes = [vscene("sp_001", "ready"), vscene("sp_002", "ready"), vscene("sp_003", "running")];
  for (const b of [{ ...vbatch([scenes[2]!]), full: false }, { ...vbatch([scenes[2]!]), full: true, plan_revision: 1 }]) {
    fakeFetch(base(scenesState({ scenes, batches: [b] })));
    const { unmount } = renderQ(<ScenesTab {...props()} />);
    const bar = await screen.findByTestId("batch-bar");
    expect(bar.textContent).toContain(t("scriptOutput.batch.progress", { ready: 0, total: 1 }));
    expect(screen.queryByTestId("skipped")).toBeNull();
    unmount();
  }
});

it("I2: после отмены пакета «Сгенерировать все» шлёт новый ключ", async () => {
  const running = scenesState();
  const cancelled = scenesState({
    scenes: running.scenes.map((x) => (x.item_id === "sp_002" ? { ...x, status: "cancelled" as const, job: { ...x.job!, status: "cancelled" as const } } : x)),
  });
  let cur: VideoScenesStateDto = running;
  const { calls } = fakeFetch([(c) => (c.method === "GET" && c.url === STATE ? { body: cur } : undefined), ...base()]);
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(4));
  genAll();
  await waitFor(() => expect(posts(calls, GEN)).toHaveLength(1));
  cur = cancelled;
  fireEvent.click(within(await screen.findByTestId("batch-bar")).getByRole("button", { name: t("scriptOutput.batch.cancel") }));
  await waitFor(() => expect(tiles()[1]!.getAttribute("data-status")).toBe("cancelled"));
  genAll();
  await waitFor(() => expect(posts(calls, GEN)).toHaveLength(2));
  const [k1, k2] = posts(calls, GEN).map((c) => c.headers["idempotency-key"]);
  expect(k2).not.toBe(k1);
});

it("I2: ключ «Сгенерировать все» — от плана, ревизии, статуса задачи, stale, версии и стиля", () => {
  const s = scenesState();
  const style = { id: "st_1", current_revision: 1 };
  const k = videoAllKey(s, style);
  expect(videoAllKey(s, style)).toBe(k);
  expect(k).toMatch(/^video-all:r2:[0-9a-f]{16}$/);
  const edit = (f: (x: VideoScenesStateDto["scenes"][number]) => VideoScenesStateDto["scenes"][number]) => ({ ...s, scenes: s.scenes.map((x, i) => (i === 0 ? f(x) : x)) });
  const variants = [
    videoAllKey(s, { id: "st_1", current_revision: 2 }),
    videoAllKey(s, null),
    videoAllKey({ ...s, plan: { id: "pln_2", revision: 2 } }, style),
    videoAllKey(edit((x) => ({ ...x, stale: true })), style),
    videoAllKey(edit((x) => ({ ...x, version_id: "ver_9" })), style),
    videoAllKey(edit((x) => ({ ...x, job: { ...x.job!, status: "failed" } })), style),
  ];
  for (const v of variants) expect(v).not.toBe(k);
  expect(new Set(variants).size).toBe(variants.length);
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

it("S21: «Перегенерировать выбранные» — чекбоксы плиток (не у идущих), generate { item_ids, regenerate } с ключом пакета", async () => {
  const { calls } = fakeFetch(base());
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(4));
  const box = (i: number) => within(tiles()[i]!).queryByRole("checkbox", { name: t("videoScenes.select", { n: i + 1 }) });
  expect(box(1)).toBeNull(); // идёт генерация
  for (const i of [0, 2, 3]) expect(box(i)).toBeTruthy();
  const regen = () => screen.getByRole("button", { name: t("videoScenes.regenSelected", { n: 2 }) });
  expect((screen.getByRole("button", { name: t("videoScenes.regenSelected", { n: 0 }) }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(box(0)!);
  fireEvent.click(box(2)!);
  fireEvent.click(regen());
  // ревью S21: 2 сцены — сначала подтверждение; «Отмена» — запроса нет
  expect(screen.getByRole("dialog").textContent).toContain(t("videoScenes.confirmN", { n: 2 }));
  fireEvent.click(screen.getByRole("button", { name: t("videoScenes.confirmCancel") }));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(posts(calls, GEN)).toHaveLength(0);
  fireEvent.click(regen());
  fireEvent.click(screen.getByRole("button", { name: t("videoScenes.confirmGo") }));
  await waitFor(() => expect(posts(calls, GEN)).toHaveLength(1));
  expect(posts(calls, GEN)[0]!.body).toEqual({ revision: 2, item_ids: ["sp_001", "sp_003"], regenerate: true });
  expect(posts(calls, GEN)[0]!.headers["idempotency-key"]).toMatch(/^video-regen-selected:r2:[0-9a-f]{16}$/);
  // после запуска выбор снят
  await waitFor(() => expect((box(0) as HTMLInputElement).checked).toBe(false));
});

it("S21: «Перегенерировать устаревшие» — устаревшие не идущие сцены, generate { item_ids } без regenerate; нет устаревших — кнопки нет", async () => {
  const s = scenesState();
  const stale = scenesState({ scenes: s.scenes.map((x) => (["sp_001", "sp_002", "sp_003"].includes(x.item_id) ? { ...x, stale: true } : x)) });
  const { calls } = fakeFetch(base(stale));
  const { unmount } = renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(4));
  // sp_002 идёт — в пакет не входит
  fireEvent.click(screen.getByRole("button", { name: t("videoScenes.regenStale", { n: 2 }) }));
  expect(screen.getByRole("dialog").textContent).toContain(t("videoScenes.confirmN", { n: 2 }));
  fireEvent.click(screen.getByRole("button", { name: t("videoScenes.confirmGo") }));
  await waitFor(() => expect(posts(calls, GEN)).toHaveLength(1));
  expect(posts(calls, GEN)[0]!.body).toEqual({ revision: 2, item_ids: ["sp_001", "sp_003"] });
  expect(posts(calls, GEN)[0]!.headers["idempotency-key"]).toMatch(/^video-stale:r2:[0-9a-f]{16}$/);
  unmount();
  fakeFetch(base());
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(4));
  expect(screen.queryByRole("button", { name: /Перегенерировать устаревшие/ })).toBeNull();
});

it("ревью S21: подтверждение — «Сгенерировать все» на 2+ сцены спрашивает, на одну — нет; одна выбранная — без вопроса", async () => {
  const { calls } = fakeFetch(base());
  const { unmount } = renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(4));
  // к генерации — упавшая и несгенерированная (готовая и идущая — нет)
  fireEvent.click(screen.getByRole("button", { name: t("videoScenes.generateAll") }));
  expect(screen.getByRole("dialog").textContent).toContain(t("videoScenes.confirmAllN", { n: 2 }));
  expect(posts(calls, GEN)).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: t("videoScenes.confirmGo") }));
  await waitFor(() => expect(posts(calls, GEN)).toHaveLength(1));
  // одна выбранная сцена — сразу запрос
  fireEvent.click(within(tiles()[0]!).getByRole("checkbox", { name: t("videoScenes.select", { n: 1 }) }));
  fireEvent.click(screen.getByRole("button", { name: t("videoScenes.regenSelected", { n: 1 }) }));
  await waitFor(() => expect(posts(calls, GEN)).toHaveLength(2));
  unmount();
  // одна сцена к генерации — «Сгенерировать все» без вопроса
  const s = scenesState();
  const one = scenesState({ scenes: s.scenes.filter((x) => x.item_id !== "sp_004") });
  const f = fakeFetch(base(one));
  renderQ(<ScenesTab {...props()} />);
  await waitFor(() => expect(tiles()).toHaveLength(3));
  fireEvent.click(screen.getByRole("button", { name: t("videoScenes.generateAll") }));
  await waitFor(() => expect(posts(f.calls, GEN)).toHaveLength(1));
});

it("S21: ключ пакета выбранных — от плана, стиля, набора сцен и их задач/версий; тот же выбор — тот же ключ", () => {
  const s = scenesState();
  const style = { id: "st_1", current_revision: 1 };
  const k = videoBatchKey("regen-selected", s, ["sp_001", "sp_003"], style);
  expect(videoBatchKey("regen-selected", s, ["sp_003", "sp_001"], style)).toBe(k);
  const variants = [
    videoBatchKey("regen-selected", s, ["sp_001"], style),
    videoBatchKey("stale", s, ["sp_001", "sp_003"], style),
    videoBatchKey("regen-selected", s, ["sp_001", "sp_003"], { id: "st_1", current_revision: 2 }),
    videoBatchKey("regen-selected", { ...s, scenes: s.scenes.map((x) => (x.item_id === "sp_001" ? { ...x, version_id: "ver_9" } : x)) }, ["sp_001", "sp_003"], style),
  ];
  for (const v of variants) expect(v).not.toBe(k);
  // изменение сцены вне выбора ключ не меняет
  expect(videoBatchKey("regen-selected", { ...s, scenes: s.scenes.map((x) => (x.item_id === "sp_004" ? { ...x, stale: true } : x)) }, ["sp_001", "sp_003"], style)).toBe(k);
  // ключ «Сгенерировать все» прежний
  expect(videoAllKey(s, style)).toMatch(/^video-all:r2:[0-9a-f]{16}$/);
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
