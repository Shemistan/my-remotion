// Предупреждение статической проверки: кадры литералом в коде сцены (Task 19 F2, ruling
// 2026-10-23). Такие места не масштабируются ни правкой темпа, ни экспортом в другом fps.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { frameLiterals, frameLiteralsInDir } from "../../src/scenes/static-check.js";

const lines = (text: string) => frameLiterals([{ path: "src/Scene.tsx", text }]).map((w) => w.line);

describe("frameLiterals", () => {
  it("interpolate(frame, [140, 152]) и смещение битов на 40 кадров — предупреждение", () => {
    const text = [
      "const a = interpolate(frame, [140, 152], [0, 1], CLAMP);",
      "const b = interpolate(frame, [T.fold.end_frame - 40, T.fold.end_frame], [0, 1], CLAMP);",
    ].join("\n");
    expect(lines(text)).toEqual([1, 2]);
    const w = frameLiterals([{ path: "src/Scene.tsx", text }])[0]!;
    expect(w).toMatchObject({ file: "src/Scene.tsx", line: 1 });
    expect(w.message).toMatch(/140/);
    expect(w.message).toMatch(/props\.timing/);
  });

  it("кадровые пропы JSX с числом: Sequence from/durationInFrames, travel, until", () => {
    const text = [
      "<Sequence from={30} durationInFrames={60}>",
      "  <PulseAlongPath travel={45} />",
      "  <StatusChip until={start + 150} />",
      "</Sequence>",
    ].join("\n");
    expect(lines(text)).toEqual([1, 2, 3]);
  });

  it("сравнение frame с числом", () => {
    expect(lines("const on = frame >= 12 && frame < 40;")).toEqual([1]);
  });

  it("без предупреждения: биты из props, малые смещения, доли, кадры через frames()/токены", () => {
    const text = [
      "const a = interpolate(frame, [beat.start_frame, beat.start_frame + 3], [0, 1], CLAMP);",
      "const b = interpolate(frame, [0, 1], [0, 1]);",
      "const c = interpolate(progress, [0, 0.5, 30], [0, 1, 2]);",
      "const d = interpolate(frame, [t0, t0 + frames(s, 20)], [0, 1]);",
      "<PulseAlongPath travel={props.content.travel} delay={s.motion.enter_frames} />",
      "const e = frame - 1;",
      "<Card width={480} height={320} />",
    ].join("\n");
    expect(lines(text)).toEqual([]);
  });

  it("каталог версии: обходит src/, синтаксические ошибки не роняют проверку", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ms-frame-literals-"));
    try {
      await mkdir(join(dir, "src", "parts"), { recursive: true });
      await writeFile(join(dir, "src", "Scene.tsx"), "export const S = () => <Sequence from={90}>x</Sequence>;\n");
      await writeFile(join(dir, "src", "parts", "A.tsx"), "const x = interpolate(frame, [12, 48], [0, 1]);\n");
      await writeFile(join(dir, "src", "logo.png"), "png");
      const ws = await frameLiteralsInDir(dir);
      expect(ws.map((w) => `${w.file}:${w.line}`)).toEqual(["src/Scene.tsx:1", "src/parts/A.tsx:1"]);
      expect(await frameLiteralsInDir(join(dir, "нет"))).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
