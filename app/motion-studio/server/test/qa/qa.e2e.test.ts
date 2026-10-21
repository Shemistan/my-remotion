// QA по реальным кадрам: фикстуры рендерятся по-настоящему (renderVersion, Chrome Headless
// Shell), затем программные проверки; Visual QA — реальный `claude` (sonnet по config) на
// кадрах kit-gallery и clipped-text. Пишет только в tmp/ репозитория (итоги проверок —
// tmp/qa-e2e/*.json для отчёта). Запуск: `make e2e`.
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type MotionSpec, MotionSpecSchema, type QAIssue, type Settings, SettingsSchema } from "@ms/contracts";
import { type VolumeProbe, initStore } from "@ms/core";
import { ensureRenderBrowser, renderVersion, resolveStyle } from "@ms/render";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaudeCodeRuntime } from "../../src/agents/claude-code.js";
import { loadConfig } from "../../src/config.js";
import { DEFAULT_PROMPTS_DIR } from "../../src/pipeline/generate.js";
import { selectQaFrames } from "../../src/pipeline/qa-frames.js";
import { programmaticChecks } from "../../src/qa/programmatic.js";
import { mergeQA } from "../../src/qa/report.js";
import { specChecks } from "../../src/qa/spec-checks.js";
import { runVisualQA } from "../../src/qa/visual-agent.js";
import { makeTmp, removeTmp } from "./helpers.js";

const T = 20 * 60_000;
const RESULTS = fileURLToPath(new URL("../../../../../tmp/qa-e2e/", import.meta.url));
const QA_SCENES = fileURLToPath(new URL("../fixtures/qa-scenes/", import.meta.url));
const KIT_GALLERY = fileURLToPath(new URL("../../../render/test/fixtures/kit-gallery/", import.meta.url));

const probe: VolumeProbe = {
  volumeUuid: async () => "VOL-A",
  deviceId: async () => 2,
  systemDeviceId: async () => 1,
  freeBytes: async () => 100 * 1024 ** 3,
};

let tmp: string;
let root: string;
let cacheDir: string;
const costs: Record<string, number> = {};

interface Rendered {
  dir: string;
  spec: MotionSpec;
  settings: Settings;
  frames: number[];
  programmatic: QAIssue[];
  spec_issues: QAIssue[];
}
const rendered = new Map<string, Rendered>();

async function renderFixture(name: string, src: string, specPath: string): Promise<Rendered> {
  const dir = join(tmp, name);
  await cp(src, dir, { recursive: true });
  const settings = SettingsSchema.parse(JSON.parse(await readFile(join(dir, "settings.json"), "utf8")));
  const spec = MotionSpecSchema.parse(JSON.parse(await readFile(specPath, "utf8")));
  const frames = selectQaFrames(spec, settings.duration_frames);
  const r = await renderVersion({
    versionDir: dir, settings, cacheDir, stills: frames, preview: { scale: 0.5, crf: 23 }, timeoutMs: 300_000,
    run: { root, runId: `qa-${name}`, attempt: 1 },
  });
  expect(r.error, name).toBeUndefined();
  expect(r.ok).toBe(true);
  const style = resolveStyle({ preset: settings.style_preset, intensity: settings.animation_intensity, safe_area: settings.safe_area, fps: settings.fps });
  const programmatic = await programmaticChecks({
    frames: frames.map((f, i) => ({ frame: f, path: r.stills[i]! })),
    spec, settings, style, render: r, previewBytes: (await stat(r.previewPath!)).size,
  });
  const out = { dir, spec, settings, frames, programmatic, spec_issues: specChecks(spec, settings) };
  await writeFile(join(RESULTS, `${name}.programmatic.json`), JSON.stringify({ frames, programmatic, spec: out.spec_issues }, null, 1));
  console.log(`${name}: кадры ${frames.join(", ")}; программные: ${JSON.stringify(programmatic.map((i) => [i.code, i.severity, i.frame, i.area]))}; spec: ${JSON.stringify(out.spec_issues.map((i) => [i.code, i.severity]))}`);
  rendered.set(name, out);
  return out;
}

const codes = (l: QAIssue[], severity?: QAIssue["severity"]) => l.filter((i) => !severity || i.severity === severity).map((i) => i.code);

beforeAll(async () => {
  await ensureRenderBrowser();
  tmp = await makeTmp();
  root = join(tmp, "store");
  await initStore(root, probe, {});
  cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  await mkdir(RESULTS, { recursive: true });
}, T);

afterAll(async () => {
  console.log("Visual QA, $:", JSON.stringify(costs));
  if (tmp) await removeTmp(tmp);
});

describe("программные проверки на отрендеренных фикстурах", () => {
  it("clipped-text → clipping (blocking)", async () => {
    const r = await renderFixture("clipped-text", join(QA_SCENES, "clipped-text"), join(QA_SCENES, "clipped-text/spec.json"));
    expect(r.programmatic).toContainEqual(expect.objectContaining({ code: "clipping", severity: "blocking", area: "right" }));
    expect(codes(r.programmatic)).not.toContain("blank");
    expect(codes(r.programmatic)).not.toContain("frozen");
  }, T);

  it("blank → blank (blocking), кадр 0 не флагуется", async () => {
    const r = await renderFixture("blank", join(QA_SCENES, "blank"), join(QA_SCENES, "blank/spec.json"));
    const blank = r.programmatic.filter((i) => i.code === "blank");
    expect(blank.length).toBeGreaterThan(0);
    expect(blank.every((i) => i.severity === "blocking" && i.frame! > 0)).toBe(true);
  }, T);

  it("frozen → frozen (blocking)", async () => {
    const r = await renderFixture("frozen", join(QA_SCENES, "frozen"), join(QA_SCENES, "frozen/spec.json"));
    expect(r.programmatic).toContainEqual(expect.objectContaining({ code: "frozen", severity: "blocking" }));
    expect(codes(r.programmatic)).not.toContain("blank");
  }, T);

  it("uniform-fade → uniform_entrance (blocking)", async () => {
    const r = await renderFixture("uniform-fade", join(QA_SCENES, "uniform-fade"), join(QA_SCENES, "uniform-fade/spec.json"));
    expect(r.spec_issues).toContainEqual(expect.objectContaining({ code: "uniform_entrance", severity: "blocking" }));
    expect(codes(r.programmatic, "blocking")).toEqual([]);
  }, T);

  it("kit-gallery (рабочая сцена kit) — без blocking программных замечаний", async () => {
    const r = await renderFixture("kit-gallery", KIT_GALLERY, join(QA_SCENES, "kit-gallery.spec.json"));
    expect(codes(r.programmatic, "blocking")).toEqual([]);
  }, T);
});

describe("Visual QA: реальный claude", () => {
  const visual = async (name: string, brief: unknown) => {
    const r = rendered.get(name)!;
    const config = loadConfig({ MS_DATA_DIR: root });
    const agents = new ClaudeCodeRuntime({ bin: config.claudeBin, logRoot: join(root, "logs", "agent-runs"), promptsDir: DEFAULT_PROMPTS_DIR });
    const style = resolveStyle({ preset: r.settings.style_preset, intensity: r.settings.animation_intensity, safe_area: r.settings.safe_area, fps: r.settings.fps });
    const res = await runVisualQA(
      { workdir: r.dir, frames: r.frames, spec: r.spec, style, brief, runRef: { root, runId: `qa-${name}`, attempt: 1 }, signal: new AbortController().signal },
      { agents, config },
    );
    costs[name] = res.usage.costUsd;
    await writeFile(join(RESULTS, `${name}.visual-qa.json`), JSON.stringify({ status: res.status, error: res.error, usage: res.usage, output: res.output }, null, 1));
    console.log(`${name} Visual QA:`, JSON.stringify({ status: res.status, error: res.error, usage: res.usage, output: res.output }, null, 1));
    return { r, res };
  };

  it("kit-gallery: completed, checked_frames ⊆ переданных, OCR «Рост пользователей»", async () => {
    const { r, res } = await visual("kit-gallery", { prompt: "Рост пользователей с 10 000 до 1 000 000 и схема AI-агента с инструментами", settings: rendered.get("kit-gallery")!.settings });
    expect(res.status).toBe("completed");
    expect(res.usage.model).toContain("sonnet");
    const out = res.output!;
    expect(out.checked_frames.length).toBeGreaterThan(0);
    for (const f of out.checked_frames) expect(r.frames).toContain(f);
    expect(out.ocr.flatMap((o) => o.texts).join(" ")).toContain("Рост пользователей");
    expect(out.elements_seen.map((e) => e.id).sort()).toEqual(r.spec.elements.map((e) => e.id).sort());
  }, T);

  it("clipped-text: gate.visual ≠ pass", async () => {
    const { r, res } = await visual("clipped-text", { prompt: "Рост пользователей: полоса от 10 000 до 1 000 000", settings: rendered.get("clipped-text")!.settings });
    expect(res.status).toBe("completed");
    const report = mergeQA({ technical: [], programmatic: r.programmatic, agent: res.output });
    expect(res.output!.gate.visual).not.toBe("pass");
    expect(report.gate.visual).toBe("fail");
  }, T);
});
