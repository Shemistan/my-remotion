// Task 40 (fix): «← К видео» из Playground ведёт на `/projects/<id>?tab=scenes` — VideoWorkspace
// открывается на вкладке из query; неизвестная вкладка или её нет — «Медиа».
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VideoWorkspace } from "../../src/pages/VideoWorkspace.js";
import { navigate } from "../../src/router.js";
import { TS, fakeFetch, on, renderQ } from "../helpers.js";

vi.mock("../../src/components/video/ProxyPlayer.js", () => ({ ProxyPlayer: () => <div data-testid="player" /> }));
vi.mock("../../src/components/video/Waveform.js", () => ({ Waveform: () => null }));
vi.mock("../../src/components/video/ThumbStrip.js", () => ({ ThumbStrip: () => null }));
vi.mock("../../src/components/video/MediaInfo.js", () => ({ MediaInfo: () => null }));
vi.mock("../../src/components/video/AsrStatus.js", () => ({ AsrStatus: () => null }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const dto = {
  project: { id: "p1", kind: "video", title: "Ролик", settings: null, created_at: TS, updated_at: TS },
  media: {
    asset: { id: "med_1", probe: { duration_us: 60_000_000, timeline_fps: { num: 30, den: 1 }, video: { display_width: 1920, display_height: 1080 } } },
    derivatives: [], transcript_id: null,
  },
  transcript: null, edl: null, approvals: { A: { state: "missing" }, B: { state: "missing" } },
  footage: null, semantic: null, plan: null, style: null, jobs: [],
};

it.each([["?tab=scenes", "Сцены"], ["?tab=nope", "Медиа"], ["", "Медиа"]])("стартовая вкладка из query «%s» → %s", async (search, name) => {
  window.history.replaceState(null, "", `/projects/p1${search}`);
  fakeFetch([on("GET", "/api/projects/p1/video", dto)]);
  renderQ(<VideoWorkspace id="p1" />);
  await screen.findAllByRole("tab");
  expect(screen.getByRole("tab", { name }).getAttribute("aria-selected")).toBe("true");
});

it("Task 45 (fix): переход по адресу без перезагрузки (`navigate`) переключает вкладку; клик по вкладке пишет её в адрес", async () => {
  window.history.replaceState(null, "", "/projects/p1?tab=timeline");
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined); // jsdom: scrollTo не реализован
  fakeFetch([on("GET", "/api/projects/p1/video", dto)]);
  renderQ(<VideoWorkspace id="p1" />);
  await screen.findAllByRole("tab");
  expect(screen.getByRole("tab", { name: "Таймлайн" }).getAttribute("aria-selected")).toBe("true");
  act(() => navigate("/projects/p1?tab=plan&item=sp_001"));
  expect(screen.getByRole("tab", { name: "План" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: "Таймлайн" }));
  expect(window.location.search).toBe("?tab=timeline");
  // повторный переход на ту же сцену плана снова открывает «План»
  act(() => navigate("/projects/p1?tab=plan&item=sp_001"));
  expect(screen.getByRole("tab", { name: "План" }).getAttribute("aria-selected")).toBe("true");
});
