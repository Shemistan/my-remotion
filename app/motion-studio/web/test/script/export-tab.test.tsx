// S9: вкладка «Экспорт» — формат 16:9 / 9:16, «Собрать папку» (задача script.package),
// карточки пакетов (файлы NN_slug.mp4 + _alpha.mov, «не вошли» с причинами, «Показать в
// Finder», шпаргалка), «Переделать под 9:16» (все или выбранные).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/index.js";
import { ExportTab } from "../../src/pages/script/ExportTab.js";
import { type Call, fakeFetch, job, on, renderQ } from "../helpers.js";
import { batch, outState, pkg, scene } from "./output-fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const posts = (calls: Call[], url: string) => calls.filter((c) => c.method === "POST" && c.url === url);
const pkgJob = (over: Record<string, unknown> = {}) => job({ id: "job_pkg", type: "script.package", status: "running", stage: null, ...over });
const routes = (jobOver: Record<string, unknown> = {}) => [
  on("POST", "/api/projects/p1/script/package", { job: pkgJob() }, 202),
  on("GET", "/api/jobs/job_pkg", { job: pkgJob(jobOver), events: [], processes: [] }),
  on("POST", "/api/script-packages/pkg_1/reveal", null, 204),
  on("POST", "/api/projects/p1/script/reframe", batch([]), 202),
  on("GET", "/api/script-packages/pkg_2", pkg({ id: "pkg_2", display_name: "Go map_16x9_2026-10-25", missing: [] })),
];

it("«Собрать папку 16:9» → package { aspect: 16:9 } с ключом; ход задачи; 9:16 — свой формат", async () => {
  const { calls } = fakeFetch(routes());
  renderQ(<ExportTab state={outState()} />);
  expect((screen.getByRole("radio", { name: "16:9" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByTestId("export-ready").textContent).toContain(t("scriptOutput.export.ready", { ready: 1, total: 4 }));
  fireEvent.click(screen.getByRole("button", { name: t("scriptOutput.export.build", { aspect: "16:9" }) }));
  await waitFor(() => expect(posts(calls, "/api/projects/p1/script/package")).toHaveLength(1));
  const call = posts(calls, "/api/projects/p1/script/package")[0]!;
  expect(call.body).toEqual({ aspect: "16:9" });
  expect(call.headers["idempotency-key"]).toBeTruthy();
  expect(await screen.findByText(t("job.type.script.package"))).toBeTruthy();
});

it("9:16 без готовых вертикальных сцен — сборка недоступна, подсказка", () => {
  fakeFetch(routes());
  renderQ(<ExportTab state={outState()} />);
  fireEvent.click(screen.getByRole("radio", { name: "9:16" }));
  const build = screen.getByRole("button", { name: t("scriptOutput.export.build", { aspect: "9:16" }) }) as HTMLButtonElement;
  expect(build.disabled).toBe(true);
  expect(screen.getByText(t("scriptOutput.export.noneReady"))).toBeTruthy();
});

it("готовая 9:16 → «Собрать папку 9:16» шлёт aspect 9:16", async () => {
  const { calls } = fakeFetch(routes());
  const s = outState();
  renderQ(<ExportTab state={outState({ scenes: [...s.scenes, scene("ss_001", "ready", { aspect: "9:16", scene_id: "sc_v1", version_id: "ver_v1" })] })} />);
  fireEvent.click(screen.getByRole("radio", { name: "9:16" }));
  fireEvent.click(screen.getByRole("button", { name: t("scriptOutput.export.build", { aspect: "9:16" }) }));
  await waitFor(() => expect(posts(calls, "/api/projects/p1/script/package")).toHaveLength(1));
  expect(posts(calls, "/api/projects/p1/script/package")[0]!.body).toEqual({ aspect: "9:16" });
});

it("пакет: файлы, «не вошли» с причинами по-русски, «Показать в Finder» → reveal", async () => {
  const { calls } = fakeFetch(routes());
  renderQ(<ExportTab state={outState({ packages: [pkg()] })} />);
  const card = screen.getByTestId("package-card");
  expect(card.textContent).toContain("Go map_16x9_2026-10-24");
  expect(card.textContent).toContain("/Volumes/SSD/MotionStudio/workspace/projects/p1/packages/pkg_1");
  const files = within(card).getByTestId("package-files");
  expect(files.textContent).toContain("01_v-go-1-24.mp4");
  expect(files.textContent).toContain("01_v-go-1-24_alpha.mov");
  expect(files.textContent).toContain("02_tablica-delitsya_alpha.mov");
  const missing = within(card).getByTestId("package-missing");
  expect(missing.textContent).toContain(t("scriptOutput.package.missingTitle", { n: 2 }));
  expect(missing.textContent).toContain(t("scriptOutput.scene.n", { n: 3 }));
  expect(missing.textContent).toContain(t("scriptOutput.missing.no_ready_version"));
  expect(missing.textContent).toContain(t("scriptOutput.missing.stale"));
  expect(missing.textContent).not.toMatch(/no_ready_version|\bstale\b|ss_00/);
  fireEvent.click(within(card).getByRole("button", { name: t("scriptOutput.package.reveal") }));
  await waitFor(() => expect(posts(calls, "/api/script-packages/pkg_1/reveal")).toHaveLength(1));
  // шпаргалка — ссылки на скачивание
  expect(within(card).getByRole("link", { name: t("scriptOutput.cheatsheet.csv") }).getAttribute("href")).toBe("/api/script-packages/pkg_1/cheatsheet?format=csv");
  expect(document.body.textContent).not.toMatch(/undefined|NaN|\bnull\b/);
});

it("неизвестная причина «не вошли» — общий текст и подробность сервера, без пустых строк", () => {
  fakeFetch(routes());
  renderQ(<ExportTab state={outState({ packages: [pkg({ missing: [{ item_id: "ss_009", reason: "экспорт упал: нет места" }] })] })} />);
  const missing = screen.getByTestId("package-missing");
  expect(missing.textContent).toContain(t("scriptOutput.scene.removed"));
  expect(missing.textContent).toContain("экспорт упал: нет места");
});

it("задача сборки завершилась → новый пакет показан по package_id (useScriptPackage)", async () => {
  fakeFetch(routes({ status: "completed", progress: 1, output_refs: { package_id: "pkg_2" } }));
  renderQ(<ExportTab state={outState()} />);
  fireEvent.click(screen.getByRole("button", { name: t("scriptOutput.export.build", { aspect: "16:9" }) }));
  const card = await screen.findByTestId("package-card");
  expect(card.textContent).toContain("Go map_16x9_2026-10-25");
});

it("пакеты — новые сверху", () => {
  fakeFetch(routes());
  const old = pkg({ id: "pkg_a", display_name: "старый", created_at: "2026-10-23T09:00:00.000Z" });
  const fresh = pkg({ id: "pkg_b", display_name: "новый", created_at: "2026-10-24T09:00:00.000Z" });
  renderQ(<ExportTab state={outState({ packages: [old, fresh] })} />);
  expect(screen.getAllByTestId("package-card").map((x) => within(x).getByTestId("package-title").textContent)).toEqual(["новый", "старый"]);
});

it("«Переделать под 9:16»: все готовые или выбранные → reframe", async () => {
  const { calls } = fakeFetch(routes());
  const s = outState();
  const two = outState({ scenes: s.scenes.map((x) => (x.item_id === "ss_002" ? scene("ss_002", "ready") : x)) });
  renderQ(<ExportTab state={two} />);
  const box = screen.getByTestId("reframe");
  fireEvent.click(within(box).getByRole("button", { name: t("scriptOutput.reframe.all", { n: 2 }) }));
  await waitFor(() => expect(posts(calls, "/api/projects/p1/script/reframe")).toHaveLength(1));
  expect(posts(calls, "/api/projects/p1/script/reframe")[0]!.body).toEqual({ aspect: "9:16" });
  // выбор одной сцены
  const checks = within(box).getAllByRole("checkbox");
  expect(checks).toHaveLength(2);
  const picked = within(box).getByRole("button", { name: t("scriptOutput.reframe.selected", { n: 0 }) }) as HTMLButtonElement;
  expect(picked.disabled).toBe(true);
  fireEvent.click(checks[1]!);
  fireEvent.click(within(box).getByRole("button", { name: t("scriptOutput.reframe.selected", { n: 1 }) }));
  await waitFor(() => expect(posts(calls, "/api/projects/p1/script/reframe")).toHaveLength(2));
  expect(posts(calls, "/api/projects/p1/script/reframe")[1]!.body).toEqual({ aspect: "9:16", item_ids: ["ss_002"] });
});
