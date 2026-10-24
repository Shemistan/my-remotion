// Task 30: разбор вывода `vision-detect` и запуск бинарника (фейковый скрипт — только логика).
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileProcessRegistry } from "@ms/core";
import { VisionError, fromVisionRect, parseVisionOutput, runVisionDetect, visionAvailable } from "../../src/analysis/vision.js";
import { type TestStore, makeStore, removeStore } from "../db/helpers.js";

describe("fromVisionRect", () => {
  it("начало снизу слева → сверху слева", () => {
    expect(fromVisionRect({ x: 0.5, y: 0.1, w: 0.2, h: 0.3 })).toEqual({ x: 0.5, y: 0.6, w: 0.2, h: 0.3 });
    expect(fromVisionRect({ x: 0, y: 0, w: 1, h: 1 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

const raw = (over: Record<string, unknown> = {}) => ({
  path: "/d/frames/000001000000.png", width: 640, height: 360,
  faces: [{ x: 0.55, y: 0.4, w: 0.25, h: 0.45, confidence: 0.9 }],
  humans: [], hands: [{ x: 0.1, y: 0.0, w: 0.2, h: 0.2, confidence: 0.8 }], saliency: [],
  ...over,
});

describe("parseVisionOutput", () => {
  it("схема, переворот y, обрезка по кадру; вырожденные рамки отбрасываются", () => {
    const [f] = parseVisionOutput([raw({ saliency: [{ x: 0.9, y: 0.5, w: 0.3, h: 0.2, confidence: 1 }, { x: 0.2, y: 0.2, w: 0, h: 0.1, confidence: 1 }] })]);
    expect(f!.faces[0]).toEqual({ x: 0.55, y: 0.15, w: 0.25, h: 0.45, confidence: 0.9 });
    expect(f!.hands[0]).toEqual({ x: 0.1, y: 0.8, w: 0.2, h: 0.2, confidence: 0.8 });
    expect(f!.saliency).toEqual([{ x: 0.9, y: 0.3, w: 0.1, h: 0.2, confidence: 1 }]);
  });

  it("не тот формат — ошибка, а не тихий пустой результат", () => {
    expect(() => parseVisionOutput({})).toThrow();
    expect(() => parseVisionOutput([raw({ faces: [{ x: "a" }] })])).toThrow();
    expect(() => parseVisionOutput([raw({ extra: 1 })])).toThrow();
  });
});

describe("runVisionDetect", () => {
  let s: TestStore;
  let dir: string;
  const run = () => ({ root: s.root, runId: "job_TEST", attempt: 1, registry: fileProcessRegistry(s.root) });

  beforeAll(async () => {
    s = await makeStore("ms-vision-");
    dir = s.tmp;
  });
  afterAll(async () => {
    if (s) await removeStore(s);
  });

  async function fakeBin(name: string, body: string): Promise<string> {
    const p = join(dir, name);
    await writeFile(p, `#!/bin/sh\n${body}\n`);
    await chmod(p, 0o755);
    return p;
  }

  it("нет бинарника — недоступен (режим llm_only решает вызывающий)", async () => {
    expect(await visionAvailable(join(dir, "nope"))).toBe(false);
    expect(await visionAvailable(await fakeBin("ok.sh", "exit 0"))).toBe(true);
  });

  it("кадры порциями, порядок и пути сверяются; аргументы — только переданные пути", async () => {
    // фейк: печатает JSON по своим аргументам и пишет их в журнал
    const bin = await fakeBin("echo.sh", `echo "$@" >> "${dir}/args.log"
printf '['
sep=''
for p in "$@"; do printf '%s{"path":"%s","width":640,"height":360,"faces":[],"humans":[],"hands":[],"saliency":[]}' "$sep" "$p"; sep=','; done
printf ']\\n'`);
    const pngs = Array.from({ length: 5 }, (_, k) => join(dir, `f${k}.png`));
    const frames = await runVisionDetect(bin, pngs, { run: run(), signal: new AbortController().signal, chunk: 2 });
    expect(frames.map((f) => f.path)).toEqual(pngs);
  });

  it("код ≠ 0, чужой путь в выводе, мусор — VisionError", async () => {
    const pngs = [join(dir, "a.png")];
    const bad = await fakeBin("bad.sh", "echo boom >&2; exit 3");
    await expect(runVisionDetect(bad, pngs, { run: run(), signal: new AbortController().signal })).rejects.toThrow(/код 3.*boom/s);
    const other = await fakeBin("other.sh", `echo '[{"path":"/etc/x.png","width":1,"height":1,"faces":[],"humans":[],"hands":[],"saliency":[]}]'`);
    await expect(runVisionDetect(other, pngs, { run: run(), signal: new AbortController().signal })).rejects.toBeInstanceOf(VisionError);
    const junk = await fakeBin("junk.sh", "echo not-json");
    await expect(runVisionDetect(junk, pngs, { run: run(), signal: new AbortController().signal })).rejects.toThrow(/JSON/);
  });

  it("таймаут и отмена: процесс убит, ошибка своего вида", async () => {
    const slow = await fakeBin("slow.sh", "exec sleep 30");
    const pngs = [join(dir, "a.png")];
    const t0 = Date.now();
    await expect(runVisionDetect(slow, pngs, { run: run(), signal: new AbortController().signal, timeoutMs: 300 })).rejects.toMatchObject({ kind: "timeout" });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 200);
    await expect(runVisionDetect(slow, pngs, { run: run(), signal: ac.signal })).rejects.toMatchObject({ kind: "aborted" });
    expect(Date.now() - t0).toBeLessThan(8000);
  });
});
