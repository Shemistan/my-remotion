// S15b: сборка QA сцены сценария по всей сцене (временной проход + энергия превью) и по герою
// (пик payoff из прохода, удержание — из пробы стоп-кадра N−1).
import { type MotionSpec, type Settings, defaultSettings } from "@ms/contracts";
import { FfmpegError, SWEEP_TAG, summarizeSweep } from "@ms/render";
import { describe, expect, it } from "vitest";
import { payoffStart, scriptSceneIssues } from "../../src/pipeline/script-temporal.js";
import type { LayoutFrame } from "../../src/qa/layout.js";

const SIZE = { w: 1920, h: 1080 };
const settings: Settings = { ...defaultSettings(), duration_frames: 300, style_preset: "tech-neon" };
const spec = {
  title: "t", purpose: "p", duration_frames: 300, fps: { num: 30, den: 1 }, style_preset: "tech-neon",
  elements: [{ id: "x", kind: "chart", role: "r", entrance: "draw", content: {} }],
  phases: [{ id: "a", role: "action", weight: 1, element_ids: ["x"] }, { id: "p", role: "payoff", weight: 1, element_ids: ["x"] }, { id: "h", role: "hold", weight: 1, element_ids: ["x"] }],
  beats: [
    { id: "b-draw", start_frame: 15, end_frame: 150, action: "рисование", description: "", element_ids: ["x"], phase: "a", kind: "sustain" },
    { id: "b-hit", start_frame: 150, end_frame: 200, action: "удар", description: "", element_ids: ["x"], phase: "p", kind: "accent" },
    { id: "b-hold", start_frame: 270, end_frame: 300, action: "удержание", description: "", element_ids: ["x"], phase: "h", kind: "hold" },
  ],
} as MotionSpec;

/** Логи прохода: маленький график (10 % кадра) весь ролик. */
function logs(): string[] {
  const g = { x: 300, y: 300, w: 640, h: 330 };
  const out: string[] = [];
  for (let f = 0; f < 300; f += 6) out.push(`[log] ${SWEEP_TAG} ${JSON.stringify(summarizeSweep(f, SIZE, { items: [], boxes: [], graphics: [g], groups: [[g]], accents: [], areas: { text: 0.01, graphic: 0.1 } }))}`);
  return out;
}
const hold: LayoutFrame = { frame: 299, height: 1080, items: [], ghosts: [], areas: { text: 0.02, graphic: 0.1 }, heroes: [{ kind: "graphic", share: 0.1, accent: false, rect: { x: 0, y: 0, w: 1, h: 1 } }] };

describe("scriptSceneIssues", () => {
  it("пик payoff — начало payoff + 10; малый герой на пике и в удержании — no_hero; стоящий кадр при идущем бите — dead_air", async () => {
    expect(payoffStart(spec)).toBe(150);
    const still = async () => ({ frames: Array.from({ length: 50 }, (_, k) => k * 6), luma: Array.from({ length: 50 }, () => new Uint8Array(96 * 54).fill(50)) });
    const r = await scriptSceneIssues({ spec, settings, browserLogs: logs(), layout: [hold], previewPath: "/fake.mp4", window: { lead: 15, speech: 255, tail: 30 }, technique: "line-trend", luma: still });
    const codes = r.issues.map((x) => `${x.code}:${x.severity}`);
    expect(codes).toContain("no_hero:warning");
    expect(codes).toContain("dead_air:blocking");
    expect(r.issues.every((x) => x.source === "programmatic")).toBe(true);
    expect(r.notes.join("\n")).toMatch(/50 кадров пробы/);
  });

  it("сбой яркости превью — без dead_air, с записью в журнал; нет прохода — только герой", async () => {
    const r = await scriptSceneIssues({ spec, settings, browserLogs: logs(), layout: [hold], previewPath: "/fake.mp4", window: { lead: 15, speech: 255, tail: 30 }, luma: async () => {
      throw new Error("ffmpeg: boom");
    } });
    expect(r.issues.some((x) => x.code === "dead_air")).toBe(false);
    expect(r.notes.join("\n")).toMatch(/энергия движения превью не посчитана/);
    const none = await scriptSceneIssues({ spec, settings, browserLogs: [], layout: [hold], window: { lead: 15, speech: 255, tail: 30 } });
    // S17b: пропуск проверок по всей сцене виден в QA (warning), а не только в журнале
    expect(none.issues.map((x) => `${x.code}:${x.severity}`)).toEqual(["temporal_skipped:warning", "no_hero:warning"]);
    expect(none.notes.join("\n")).toMatch(/проверки по всей сцене пропущены/);
  });

  it("S17b: проход упал и повтор тоже — temporal_skipped (warning) с причиной; других временных замечаний нет", async () => {
    const r = await scriptSceneIssues({
      spec, settings, browserLogs: [`[sweep-retry] Page crashed!`, ...logs().slice(0, 1), `[sweep-error] повтор: Page crashed!`], layout: [hold],
      previewPath: "/fake.mp4", window: { lead: 15, speech: 255, tail: 30 }, luma: async () => ({ frames: [], luma: [] }),
    });
    const t = r.issues.find((x) => x.code === "temporal_skipped")!;
    expect(t).toMatchObject({ source: "programmatic", severity: "warning" });
    expect(t.description).toMatch(/Page crashed!/);
    expect(r.issues.some((x) => ["dead_air", "empty_half", "empty_open", "late_hero", "empty_container"].includes(x.code))).toBe(false);
  });

  it("S17b: повтор прохода удался — кадры первого (оборванного) прохода не смешиваются со вторым", async () => {
    const partial = logs().slice(0, 30);
    const r = await scriptSceneIssues({
      spec, settings, browserLogs: [...partial, `[sweep-retry] Page crashed!`, ...logs()], layout: [hold],
      previewPath: "/fake.mp4", window: { lead: 15, speech: 255, tail: 30 }, luma: async () => {
        throw new Error("нет ffmpeg");
      },
    });
    expect(r.issues.some((x) => x.code === "temporal_skipped")).toBe(false);
    expect(r.notes.join("\n")).toMatch(/50 кадров пробы \(0–294\)/);
  });

  it("отмена и orphaned в яркости превью пробрасываются, как у остальных шагов; таймаут — заметка (ревью S15b, M-3)", async () => {
    const run = (kind: FfmpegError["kind"]) => scriptSceneIssues({ spec, settings, browserLogs: logs(), layout: [hold], previewPath: "/fake.mp4", window: { lead: 15, speech: 255, tail: 30 }, luma: async () => {
      throw new FfmpegError(kind, `ffmpeg: ${kind}`);
    } });
    await expect(run("aborted")).rejects.toMatchObject({ kind: "aborted" });
    await expect(run("orphaned")).rejects.toMatchObject({ kind: "orphaned" });
    expect((await run("timeout")).notes.join("\n")).toMatch(/энергия движения превью не посчитана/);
  });
});
