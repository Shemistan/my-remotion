// Task 40: Playground сцены видеопроекта — «← К видео» на рабочее место проекта и «Утвердить (C)»
// текущей версии (состояние — из сцен видеопроекта); у сцены обычного проекта — ни того ни другого.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/index.js";
import { Playground } from "../../src/pages/Playground.js";
import { versionDto } from "../fixtures.js";
import { TS, fakeFetch, on, renderQ } from "../helpers.js";
import { scenesState, vscene } from "./scenes-fixtures.js";

afterEach(() => vi.unstubAllGlobals());

const vrow = (n: number) => ({ version_id: `ver_${n}`, number: n, status: "ready", parent_version_id: null, created_at: TS, prompt: "сцена", broken_reason: null });

function routes(kind: "video" | "playground", current = "ver_1") {
  return fakeFetch([
    on("GET", "/api/scenes/scn_1", {
      scene: { id: "scn_1", project_id: "p1", title: "01 · выручка выросла", current_version_id: current, approved_version_id: null, created_at: TS },
      versions: current === "ver_1" ? [] : [vrow(1), vrow(2)],
      active_job: null,
    }),
    on("GET", "/api/versions/ver_2", versionDto("ver_2", 2)),
    on("GET", "/api/projects/p1", { project: { id: "p1", kind, title: "Ролик", settings: null, created_at: TS, updated_at: TS }, scenes: [], exports: [] }),
    on("GET", "/api/versions/ver_1", versionDto("ver_1", 1)),
    on("GET", "/api/scenes/scn_1/messages", []),
    on("GET", "/api/projects/p1/video/scenes", scenesState({
      scenes: [vscene("sp_001", "ready", current === "ver_1" ? {} : { version_id: "ver_2", version_number: 2 })], batches: [],
    })),
    on("POST", "/api/scenes/scn_1/approve", {}, 201),
  ]);
}

it("сцена видеопроекта → «← К видео» на вкладку «Сцены» и «Утвердить v1 (C)» открытой версии", async () => {
  const { calls } = routes("video");
  renderQ(<Playground id="scn_1" />);
  const link = await screen.findByRole("link", { name: t("videoScenes.backToVideo") });
  expect(link.getAttribute("href")).toBe("/projects/p1?tab=scenes");
  const approve = (await screen.findByRole("button", { name: t("videoScenes.c.approveN", { n: 1 }) })) as HTMLButtonElement;
  await waitFor(() => expect(approve.disabled).toBe(false));
  fireEvent.click(approve);
  await waitFor(() => expect(calls.filter((c) => c.method === "POST" && c.url === "/api/scenes/scn_1/approve")).toHaveLength(1));
  expect(calls.find((c) => c.method === "POST")!.body).toEqual({ version_id: "ver_1" });
});

it("сцена обычного проекта — без «← К видео», C и запроса сцен видеопроекта", async () => {
  const { calls } = routes("playground");
  renderQ(<Playground id="scn_1" />);
  await screen.findByRole("link", { name: t("nav.project") });
  await waitFor(() => expect(calls.some((c) => c.url === "/api/projects/p1")).toBe(true));
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole("link", { name: t("videoScenes.backToVideo") })).toBeNull();
  expect(screen.queryByTestId("approval-c")).toBeNull();
  expect(calls.some((c) => c.url === "/api/projects/p1/video/scenes")).toBe(false);
});

it("открыта нетекущая v1 при текущей v2 — утверждается открытая v1", async () => {
  const { calls } = routes("video", "ver_2");
  renderQ(<Playground id="scn_1" version="ver_1" />);
  const approve = (await screen.findByRole("button", { name: t("videoScenes.c.approveN", { n: 1 }) })) as HTMLButtonElement;
  await waitFor(() => expect(approve.disabled).toBe(false));
  fireEvent.click(approve);
  await waitFor(() => expect(calls.filter((c) => c.method === "POST" && c.url === "/api/scenes/scn_1/approve")).toHaveLength(1));
  expect(calls.find((c) => c.method === "POST")!.body).toEqual({ version_id: "ver_1" });
});

it("длительность видеосцены — только чтение с подсказкой (меняется через план); у обычной сцены — редактируемая", async () => {
  routes("video");
  const { unmount } = renderQ(<Playground id="scn_1" />);
  await screen.findByRole("link", { name: t("videoScenes.backToVideo") });
  const dur = (await screen.findByLabelText(t("settings.duration"))) as HTMLInputElement;
  await waitFor(() => expect(dur.readOnly).toBe(true));
  expect(screen.getByText(t("videoScenes.durationLocked"))).toBeTruthy();
  unmount();
  vi.unstubAllGlobals();
  routes("playground");
  renderQ(<Playground id="scn_1" />);
  await screen.findByRole("link", { name: t("nav.project") });
  const dur2 = (await screen.findByLabelText(t("settings.duration"))) as HTMLInputElement;
  expect(dur2.readOnly).toBe(false);
  expect(screen.queryByText(t("videoScenes.durationLocked"))).toBeNull();
});

it("FPS видеосцены — только чтение (FPS проекта, кадры плана); у обычной сцены — редактируемый", async () => {
  routes("video");
  const { unmount } = renderQ(<Playground id="scn_1" />);
  await screen.findByRole("link", { name: t("videoScenes.backToVideo") });
  const fps = (await screen.findByLabelText(t("settings.fps"))) as HTMLInputElement;
  await waitFor(() => expect(fps.readOnly).toBe(true));
  expect(screen.getByText(t("videoScenes.fpsLocked"))).toBeTruthy();
  unmount();
  vi.unstubAllGlobals();
  routes("playground");
  renderQ(<Playground id="scn_1" />);
  await screen.findByRole("link", { name: t("nav.project") });
  const fps2 = (await screen.findByLabelText(t("settings.fps"))) as HTMLInputElement;
  expect(fps2.readOnly).toBe(false);
  expect(screen.queryByText(t("videoScenes.fpsLocked"))).toBeNull();
});
