// S9: вкладка «Сцены» — плитки сцен в порядке плана (номер, цитата, приём, статус, превью),
// «Повторить» через generate { item_ids } (не retry задачи), «Перегенерировать» у устаревшей,
// «Доработать» → Playground, «Отменить пакет», прогресс пакета, предупреждения QA и разнообразия.
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/index.js";
import { ScenesTab } from "../../src/pages/script/ScenesTab.js";
import { techniqueLabel } from "../../src/script/format.js";
import { versionDto } from "../fixtures.js";
import { type Call, fakeFetch, job, on, renderQ } from "../helpers.js";
import { batch, outState, scene } from "./output-fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const tiles = () => screen.getAllByTestId("scene-tile");
const posts = (calls: Call[], url: string) => calls.filter((c) => c.method === "POST" && c.url === url);
const okBatch = (url: string) => on("POST", url, batch([]), 202);
const routes = () => [
  on("GET", "/api/versions/ver_1", versionDto("ver_1", 1)),
  on("GET", /\/api\/jobs\//, { job: job({ id: "job_2", status: "running" }), events: [], processes: [] }),
  okBatch("/api/projects/p1/script/generate"),
  okBatch("/api/projects/p1/script/reframe"),
  okBatch("/api/script-batches/sb_1/cancel"),
];

it("пакет из 3 сцен (ready, running, failed) → плитки по порядку плана; ready — плеер и «Доработать», failed — «Повторить»", async () => {
  const { calls } = fakeFetch(routes());
  const s = outState();
  renderQ(<ScenesTab state={s} />);
  const list = tiles();
  // 4 принятые сцены плана: ss_004 без генерации — «не генерировалась»
  expect(list.map((x) => x.getAttribute("data-item"))).toEqual(["ss_001", "ss_002", "ss_003", "ss_004"]);
  expect(list.map((x) => x.getAttribute("data-status"))).toEqual(["ready", "running", "failed", "none"]);
  const first = within(list[0]!);
  expect(first.getByText(t("scriptOutput.scene.n", { n: 1 }))).toBeTruthy();
  expect(list[0]!.textContent).toContain(`«${s.plan!.doc.items[0]!.quote}»`);
  expect(list[0]!.textContent).toContain(techniqueLabel("hero-number"));
  expect(list[0]!.textContent).toContain(t("scriptOutput.status.ready"));
  // превью готовой версии — плеер
  await waitFor(() => expect(list[0]!.querySelector("video")?.getAttribute("src")).toBe("/api/versions/ver_1/preview.mp4"));
  const refine = first.getByRole("link", { name: t("scriptOutput.refine") });
  expect(refine.getAttribute("href")).toBe("/scenes/sc_1");
  // у идущей — ход задачи, у упавшей — понятная причина и «Повторить»
  expect(list[1]!.textContent).toContain(t("scriptOutput.status.running"));
  expect(within(list[2]!).queryByRole("button", { name: t("job.retry") })).toBeNull();
  expect(list[2]!.textContent).toContain(t("job.failedAt", { stage: t("stage.engineer") }));
  fireEvent.click(within(list[2]!).getByRole("button", { name: t("scriptOutput.retry") }));
  await waitFor(() => expect(posts(calls, "/api/projects/p1/script/generate")).toHaveLength(1));
  const call = posts(calls, "/api/projects/p1/script/generate")[0]!;
  expect(call.body).toEqual({ revision: 3, item_ids: ["ss_003"] });
  expect(call.headers["idempotency-key"]).toBeTruthy();
  expect(calls.filter((c) => /\/api\/jobs\/[^/]+\/retry/.test(c.url))).toEqual([]);
  // без «Повторить» у готовой и идущей
  expect(within(list[0]!).queryByRole("button", { name: t("scriptOutput.retry") })).toBeNull();
  expect(within(list[1]!).queryByRole("button", { name: t("scriptOutput.retry") })).toBeNull();
  const all = document.body.textContent!;
  expect(all).not.toMatch(/undefined|NaN|\bnull\b/);
  for (const code of ["hero-number", "ss_00", "playground.generate"]) expect(all).not.toContain(code);
});

it("повтор той же упавшей задачи — тот же ключ; «Повторить» после новой неудачи — новый ключ", async () => {
  const { calls } = fakeFetch(routes());
  const s = outState();
  const { rerender, client } = renderQ(<ScenesTab state={s} />);
  const click = () => fireEvent.click(within(tiles()[2]!).getByRole("button", { name: t("scriptOutput.retry") }));
  click();
  await waitFor(() => expect(posts(calls, "/api/projects/p1/script/generate")).toHaveLength(1));
  click();
  await waitFor(() => expect(posts(calls, "/api/projects/p1/script/generate")).toHaveLength(2));
  const keys = posts(calls, "/api/projects/p1/script/generate").map((c) => c.headers["idempotency-key"]);
  expect(keys[0]).toBe(keys[1]);
  const again = outState({ scenes: s.scenes.map((x) => (x.item_id === "ss_003" ? { ...x, job: { ...x.job!, id: "job_9" } } : x)) });
  rerender(<QueryClientProvider client={client}><ScenesTab state={again} /></QueryClientProvider>);
  click();
  await waitFor(() => expect(posts(calls, "/api/projects/p1/script/generate")).toHaveLength(3));
  expect(posts(calls, "/api/projects/p1/script/generate")[2]!.headers["idempotency-key"]).not.toBe(keys[0]);
});

it("сцена stale → значок «сцена устарела» и «Перегенерировать» (generate regenerate: true)", async () => {
  const { calls } = fakeFetch(routes());
  const s = outState();
  const stale = outState({ scenes: s.scenes.map((x) => (x.item_id === "ss_001" ? { ...x, stale: true } : x)) });
  renderQ(<ScenesTab state={stale} />);
  const tile = tiles()[0]!;
  expect(within(tile).getByText(t("scriptOutput.stale"))).toBeTruthy();
  fireEvent.click(within(tile).getByRole("button", { name: t("scriptOutput.regenerate") }));
  await waitFor(() => expect(posts(calls, "/api/projects/p1/script/generate")).toHaveLength(1));
  expect(posts(calls, "/api/projects/p1/script/generate")[0]!.body).toEqual({ revision: 3, item_ids: ["ss_001"], regenerate: true });
  // не устаревшая сцена без значка
  expect(within(tiles()[1]!).queryByText(t("scriptOutput.stale"))).toBeNull();
});

it("прогресс пакета и «Отменить пакет» → cancel пакета", async () => {
  const { calls } = fakeFetch(routes());
  renderQ(<ScenesTab state={outState()} />);
  const bar = screen.getByTestId("batch-bar");
  expect(bar.textContent).toContain(t("scriptOutput.batch.progress", { ready: 1, total: 3 }));
  expect(bar.textContent).toContain(t("scriptOutput.batch.count.running", { n: 1 }));
  expect(bar.textContent).toContain(t("scriptOutput.batch.count.failed", { n: 1 }));
  expect(bar.textContent).not.toContain(t("scriptOutput.batch.count.cancelled", { n: 0 }));
  fireEvent.click(within(bar).getByRole("button", { name: t("scriptOutput.batch.cancel") }));
  await waitFor(() => expect(posts(calls, "/api/script-batches/sb_1/cancel")).toHaveLength(1));
});

it("пакет завершён — «Отменить пакет» нет", () => {
  fakeFetch(routes());
  const done = [scene("ss_001", "ready"), scene("ss_002", "failed")];
  renderQ(<ScenesTab state={outState({ scenes: done, batches: [batch(done)] })} />);
  expect(screen.queryByRole("button", { name: t("scriptOutput.batch.cancel") })).toBeNull();
  expect(screen.getByTestId("batch-bar").textContent).toContain(t("scriptOutput.batch.progress", { ready: 1, total: 2 }));
});

it("предупреждения QA и разнообразия — текстом на плитке, без кодов", () => {
  fakeFetch(routes());
  const s = outState();
  const warned = outState({
    scenes: s.scenes.map((x) => (x.item_id === "ss_001"
      ? {
          ...x,
          qa_warnings: [{ source: "agent", code: "accent_static", severity: "warning", description: "акцент стоит на месте", fix_hint: "-" }],
          warnings: [{ item_id: "ss_001", code: "package_technique_repeat", severity: "warning", message: "ss_001 и ss_002: hero-number подряд" }],
        }
      : x)),
  });
  renderQ(<ScenesTab state={warned} />);
  const tile = tiles()[0]!;
  expect(tile.textContent).toContain(t("qa.code.accent_static"));
  expect(tile.textContent).toContain("акцент стоит на месте");
  // сообщение разнообразия: id сцен → «сцена N», приём — по-русски
  expect(tile.textContent).toContain(`${t("scriptPlan.scene.n", { n: 1 }).toLowerCase()} и ${t("scriptPlan.scene.n", { n: 2 }).toLowerCase()}`);
  expect(tile.textContent).toContain(techniqueLabel("hero-number"));
  expect(tile.textContent).not.toMatch(/ss_00|hero-number|accent_static|package_technique_repeat/);
});

it("переключатель 16:9 / 9:16 — только при вертикальных двойниках; повтор 9:16 — reframe", async () => {
  const { calls } = fakeFetch(routes());
  const s = outState();
  const { unmount } = renderQ(<ScenesTab state={s} />);
  expect(screen.queryByRole("radio", { name: "9:16" })).toBeNull();
  unmount();
  const vertical = scene("ss_002", "failed", { aspect: "9:16", scene_id: "sc_v2" });
  renderQ(<ScenesTab state={outState({ scenes: [...s.scenes, vertical] })} />);
  expect((screen.getByRole("radio", { name: "16:9" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "9:16" }));
  const list = tiles();
  expect(list.map((x) => x.getAttribute("data-status"))).toEqual(["none", "failed", "none", "none"]);
  fireEvent.click(within(list[1]!).getByRole("button", { name: t("scriptOutput.retry") }));
  await waitFor(() => expect(posts(calls, "/api/projects/p1/script/reframe")).toHaveLength(1));
  expect(posts(calls, "/api/projects/p1/script/reframe")[0]!.body).toEqual({ aspect: "9:16", item_ids: ["ss_002"] });
  expect(posts(calls, "/api/projects/p1/script/generate")).toEqual([]);
});

it("плана нет — подсказка вместо плиток; сцен ещё нет — подсказка «утвердите план»", () => {
  fakeFetch(routes());
  const { unmount } = renderQ(<ScenesTab state={outState({ plan: null, scenes: [], batches: [] })} />);
  expect(screen.getByText(t("scriptOutput.empty.noPlan"))).toBeTruthy();
  unmount();
  renderQ(<ScenesTab state={outState({ scenes: [], batches: [] })} />);
  expect(screen.getByText(t("scriptOutput.empty.noScenes"))).toBeTruthy();
  expect(screen.queryByTestId("batch-bar")).toBeNull();
});

it("«Повторить» после неудачной перегенерации актуальной сцены (есть версия, не устарела) — regenerate: true", async () => {
  const { calls } = fakeFetch(routes());
  const s = outState();
  renderQ(<ScenesTab state={outState({ scenes: s.scenes.map((x) => (x.item_id === "ss_003" ? scene("ss_003", "failed", { version_id: "ver_3" }) : x)) })} />);
  fireEvent.click(within(tiles()[2]!).getByRole("button", { name: t("scriptOutput.retry") }));
  await waitFor(() => expect(posts(calls, "/api/projects/p1/script/generate")).toHaveLength(1));
  const call = posts(calls, "/api/projects/p1/script/generate")[0]!;
  expect(call.body).toEqual({ revision: 3, item_ids: ["ss_003"], regenerate: true });
  expect(call.headers["idempotency-key"]).toMatch(/^script-regen:/);
});

it("сервер не поставил сцену (skipped) — причина видна с номером сцены", async () => {
  fakeFetch([on("POST", "/api/projects/p1/script/generate", batch([], { skipped: [{ item_id: "ss_003", reason: "уже есть готовая версия" }] }), 200), ...routes()]);
  renderQ(<ScenesTab state={outState()} />);
  fireEvent.click(within(tiles()[2]!).getByRole("button", { name: t("scriptOutput.retry") }));
  const note = await screen.findByTestId("skipped");
  expect(note.textContent).toContain(t("scriptOutput.scene.n", { n: 3 }));
  expect(note.textContent).toContain("уже есть готовая версия");
  expect(note.textContent).not.toContain("ss_003");
});

it("S17a: полный пакет — готовые неустаревшие сцены плана вне пакета считаются в «Готово N из M» (по состоянию, без ответа мутации)", () => {
  fakeFetch(routes());
  const scenes = [scene("ss_001", "ready"), scene("ss_002", "ready"), scene("ss_003", "running")];
  const full = batch([scenes[2]!], { full: true });
  renderQ(<ScenesTab state={outState({ scenes, batches: [full] })} />);
  const bar = screen.getByTestId("batch-bar");
  expect(bar.textContent).toContain(t("scriptOutput.batch.progress", { ready: 2, total: 3 }));
  expect(bar.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow")).toBe("67");
});

it("S17a: частичный пакет, устаревшая сцена и пакет старой ревизии плана — не досчитываются", () => {
  fakeFetch(routes());
  const scenes = [scene("ss_001", "ready"), scene("ss_002", "ready", { stale: true }), scene("ss_003", "running")];
  const { unmount } = renderQ(<ScenesTab state={outState({ scenes, batches: [batch([scenes[2]!])] })} />);
  expect(screen.getByTestId("batch-bar").textContent).toContain(t("scriptOutput.batch.progress", { ready: 0, total: 1 }));
  unmount();
  const r2 = renderQ(<ScenesTab state={outState({ scenes, batches: [batch([scenes[2]!], { full: true })] })} />);
  expect(screen.getByTestId("batch-bar").textContent).toContain(t("scriptOutput.batch.progress", { ready: 1, total: 2 }));
  r2.unmount();
  renderQ(<ScenesTab state={outState({ scenes, batches: [batch([scenes[2]!], { full: true, plan_revision: 2 })] })} />);
  expect(screen.getByTestId("batch-bar").textContent).toContain(t("scriptOutput.batch.progress", { ready: 0, total: 1 }));
});
