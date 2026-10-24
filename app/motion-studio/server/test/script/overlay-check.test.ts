// Проверка наложения сцены сценария (S6, Р16): заливка корня не через <Background> —
// статикой; кадр hold с transparent = true почти непрозрачен — по альфе. Рендер и покрытие
// подменены.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type QAIssue, defaultSettings } from "@ms/contracts";
import type { RenderResult } from "@ms/render";
import { overlayChecks, rootFillIssues } from "../../src/script/overlay-check.js";
import { directorOutput, makeTmp, removeTmp } from "../pipeline/helpers.js";

let tmp: string;
beforeEach(async () => {
  tmp = await makeTmp();
});
afterEach(() => removeTmp(tmp));

const spec = directorOutput().spec; // hold b4 с кадра 150
const settings = defaultSettings();
const PROPS = { timing: { duration_frames: 180, beats: [] }, style: { preset: "dark-premium", intensity: "balanced", depth: 1, transparent: false }, content: { title: "x" } };

const scene = (body: string) => `import { AbsoluteFill } from "remotion";
import { Background, StyleProvider } from "@ms/motion-kit";
export const Scene = ({ style }: any) => (
  <StyleProvider style={style}>
    ${body}
  </StyleProvider>
);
`;

async function versionWith(src: string): Promise<string> {
  const dir = join(tmp, `v${Math.random().toString(36).slice(2)}`);
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src/Scene.tsx"), src);
  await writeFile(join(dir, "props.json"), JSON.stringify(PROPS));
  return dir;
}

interface Run {
  issues: QAIssue[];
  renders: { stills: number[]; props: Record<string, unknown> }[];
  coverageCalls: string[];
}

async function run(dir: string, o: { coverage?: { opaque: number; haze: number }; render?: Partial<RenderResult> } = {}): Promise<Run> {
  const renders: Run["renders"] = [];
  const coverageCalls: string[] = [];
  const issues = await overlayChecks(
    {
      versionDir: dir, spec, settings, signal: new AbortController().signal, run: { root: tmp, runId: "job1", attempt: 1 },
      renderStills: async (stills, props) => {
        renders.push({ stills, props });
        const p = join(tmp, `${stills[0]}.png`);
        await writeFile(p, "png");
        return { ok: true, stills: [p], browserLogs: [], ...o.render };
      },
    },
    {
      coverage: async (path, frames) => {
        coverageCalls.push(path);
        const c = o.coverage ?? { opaque: 0.4, haze: 0 };
        return { ...c, perFrame: frames.map((frame) => ({ frame, ...c })) };
      },
    },
  );
  return { issues, renders, coverageCalls };
}
const codes = (r: Run) => r.issues.map((x) => x.code);

describe("overlayChecks", () => {
  it("заливка корня AbsoluteFill с background → blocking overlay_root_fill", async () => {
    const r = await run(await versionWith(scene(`<AbsoluteFill style={{ background: "#000" }}><Background /></AbsoluteFill>`)));
    expect(codes(r)).toContain("overlay_root_fill");
    expect(r.issues.find((x) => x.code === "overlay_root_fill")).toMatchObject({ severity: "blocking", source: "programmatic", fix_hint: expect.stringMatching(/Background/) });
  });

  it("фон только <Background>, покрытие 0,4 → замечаний нет; кадр hold, props с transparent = true", async () => {
    const r = await run(await versionWith(scene(`<AbsoluteFill><Background /></AbsoluteFill>`)), { coverage: { opaque: 0.4, haze: 0 } });
    expect(codes(r)).toEqual([]);
    expect(r.renders).toHaveLength(1);
    expect(r.renders[0]!.stills).toEqual([150]);
    expect(r.renders[0]!.props).toMatchObject({ style: { transparent: true, preset: "dark-premium" }, content: { title: "x" } });
    expect(r.coverageCalls).toEqual([join(tmp, "150.png")]);
  });

  it("покрытие 0,97 → blocking overlay_opaque с подсказкой", async () => {
    const r = await run(await versionWith(scene(`<AbsoluteFill><Background /></AbsoluteFill>`)), { coverage: { opaque: 0.97, haze: 0 } });
    expect(codes(r)).toContain("overlay_opaque");
    expect(r.issues.find((x) => x.code === "overlay_opaque")).toMatchObject({ severity: "blocking", frame: 150, fix_hint: expect.stringMatching(/<Background>/) });
  });

  it("рендер кадра не удался → предупреждение overlay_check_failed, не blocking", async () => {
    const r = await run(await versionWith(scene(`<AbsoluteFill><Background /></AbsoluteFill>`)), { render: { ok: false, stills: [], error: { stage: "still", message: "boom" } } });
    expect(r.issues).toEqual([expect.objectContaining({ code: "overlay_check_failed", severity: "warning" })]);
  });
});

describe("rootFillIssues (статика)", () => {
  const files = (body: string) => [{ path: "src/Scene.tsx", text: scene(body) }];
  it.each([
    [`<AbsoluteFill style={{ backgroundColor: "#0b0d12" }} />`],
    [`<AbsoluteFill style={{ background: "linear-gradient(#000, #111)" }}><Background /></AbsoluteFill>`],
    [`<div style={{ position: "absolute", inset: 0, background: "#fff" }} />`],
    [`<div style={{ width: "100%", height: "100%", backgroundImage: "url(x)" }} />`],
  ])("заливка на весь кадр: %s", (body) => {
    expect(rootFillIssues(files(body)).map((x) => x.code)).toEqual(["overlay_root_fill"]);
  });

  it.each([
    [`<AbsoluteFill><Background /></AbsoluteFill>`],
    [`<AbsoluteFill style={{ background: "transparent" }} />`],
    [`<AbsoluteFill style={{ background: style.transparent ? undefined : "#000" }} />`],
    [`<AbsoluteFill><SafeArea><AbsoluteFill style={{ background: "#222" }} /></SafeArea></AbsoluteFill>`],
    [`<AbsoluteFill><div style={{ width: 400, height: 200, background: "#222" }} /></AbsoluteFill>`],
  ])("не заливка корня: %s", (body) => {
    expect(rootFillIssues(files(body))).toEqual([]);
  });
});
