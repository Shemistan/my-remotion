// Task 35′ (Phase 4–6 v2): реестры UI — вкладки «Сцены», «Экспорт», «Таймлайн» в Video Workspace,
// страницы «Диагностика» и «Восстановление» в маршрутах, словари областей подмешаны в `ru`.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/index.js";
import { ru } from "../../src/i18n/ru.js";
import { Diagnostics } from "../../src/pages/Diagnostics.js";
import { TABS, VideoWorkspace } from "../../src/pages/VideoWorkspace.js";
import { href, parseRoute } from "../../src/router.js";
import { TS, fakeFetch, on, renderQ } from "../helpers.js";

vi.mock("../../src/components/video/ProxyPlayer.js", () => ({ ProxyPlayer: () => <div data-testid="player" /> }));
vi.mock("../../src/components/video/Waveform.js", () => ({ Waveform: () => null }));
vi.mock("../../src/components/video/ThumbStrip.js", () => ({ ThumbStrip: () => null }));
vi.mock("../../src/components/video/MediaInfo.js", () => ({ MediaInfo: () => null }));
vi.mock("../../src/components/video/AsrStatus.js", () => ({ AsrStatus: () => null }));

afterEach(() => vi.unstubAllGlobals());

const dto = {
  project: { id: "p1", kind: "video", title: "Ролик", settings: null, created_at: TS, updated_at: TS },
  media: {
    asset: { id: "med_1", probe: { duration_us: 60_000_000, timeline_fps: { num: 30, den: 1 }, video: { display_width: 1920, display_height: 1080 } } },
    derivatives: [], transcript_id: null,
  },
  transcript: null, edl: null, approvals: { A: { state: "missing" }, B: { state: "missing" } },
  footage: null, semantic: null, plan: null, style: null, jobs: [],
};

describe("Video Workspace: вкладки Phase 4–6", () => {
  it("TABS: + scenes, export, timeline", () => {
    expect(TABS.slice(-3)).toEqual(["scenes", "export", "timeline"]);
  });

  it("вкладки видны и открывают заглушки областей", async () => {
    fakeFetch([on("GET", "/api/projects/p1/video", dto)]);
    renderQ(<VideoWorkspace id="p1" />);
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((x) => x.textContent).slice(-3)).toEqual(["Сцены", "Экспорт", "Таймлайн"]);
    for (const [name, key] of [["Сцены", "videoScenes.stub"], ["Экспорт", "videoExport.stub"], ["Таймлайн", "projectTimeline.stub"]] as const) {
      fireEvent.click(screen.getByRole("tab", { name }));
      expect(screen.getByRole("tab", { name }).getAttribute("aria-selected")).toBe("true");
      expect(screen.getByText(t(key))).toBeTruthy();
    }
  });
});

describe("страницы и маршруты Phase 6", () => {
  it("/diagnostics и /recovery", () => {
    expect(parseRoute("/diagnostics", "")).toEqual({ name: "diagnostics" });
    expect(parseRoute("/recovery", "")).toEqual({ name: "recovery" });
    expect(href({ name: "diagnostics" })).toBe("/diagnostics");
    expect(href({ name: "recovery" })).toBe("/recovery");
    expect(parseRoute("/diagnostics/x", "")).toEqual({ name: "notFound" });
  });

  it("заглушки страниц — заголовок и текст из словаря", () => {
    render(<Diagnostics />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(t("diagnostics.title"));
    // RecoveryCenter — реализован Task 47 (web/test/recovery-center.test.tsx)
  });

  it("названия новых типов задач — в словаре", () => {
    for (const type of ["video.package", "scene.preview_context", "timeline.build", "timeline.preview", "final.render", "final.reproduce", "trash.purge", "cache.gc"]) {
      expect(`job.type.${type}` in ru, type).toBe(true);
    }
  });
});
