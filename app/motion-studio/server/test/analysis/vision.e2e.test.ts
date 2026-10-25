// Task 30 e2e: Apple Vision (`vision-detect`) на 10 кадрах реального talking-head ролика
// `MS_TEST_TALKING_HEAD` (личный материал пользователя — только с его согласия, V4 плана; выбор
// ролика — Task 34 Step 1). Без переменной тест ПАДАЕТ с понятным сообщением, а не пропускается.
// Запуск — только `make e2e-footage` (MS_E2E_FACE=1), общий `make e2e` этот файл не берёт.
// Кадры — во временном каталоге tmp/ репозитория, удаляются после теста; в git не попадают.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { fileProcessRegistry } from "@ms/core";
import { keyframeArgs } from "../../src/analysis/keyframes.js";
import { DEFAULT_VISION_BIN, runVisionDetect, visionAvailable } from "../../src/analysis/vision.js";
import { type TestStore, makeStore, removeStore } from "../db/helpers.js";

const VIDEO = process.env.MS_TEST_TALKING_HEAD;
const NO_VIDEO = "MS_TEST_TALKING_HEAD не задан или файла нет: укажите путь к реальному talking-head ролику (выбор — Task 34 Step 1; нужен явный «да» человека на личный материал, V4 плана). Запуск: MS_TEST_TALKING_HEAD=<путь> make e2e-footage";

let s: TestStore;
beforeAll(async () => {
  s = await makeStore("ms-vision-e2e-");
});
afterAll(async () => {
  if (s) await removeStore(s);
});

it("лицо найдено на ≥ 8 из 10 кадров, рамка внутри кадра, площадь 1–40 %", async () => {
  expect(VIDEO && existsSync(VIDEO), NO_VIDEO).toBeTruthy();
  expect(await visionAvailable(), `нет ${DEFAULT_VISION_BIN}: npm run build:vision`).toBe(true);
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", VIDEO!]).toString().trim());
  expect(dur).toBeGreaterThan(1);
  const dir = join(s.tmp, "frames-src");
  mkdirSync(join(dir, "frames"), { recursive: true });
  const pngs: string[] = [];
  for (let k = 0; k < 10; k++) {
    const us = Math.round(((k + 0.5) / 10) * dur * 1e6);
    const out = join(dir, `frames/${String(us).padStart(12, "0")}.png`);
    // аргументы ffmpeg — как у извлечения ключевых кадров; демультиплексор — по расширению
    const args = keyframeArgs(VIDEO!, us, out).map((a) => (a === "mov" && /\.(mkv|webm)$/i.test(VIDEO!) ? "matroska" : a));
    execFileSync("ffmpeg", ["-hide_banner", "-v", "error", ...args]);
    pngs.push(out);
  }
  const t0 = Date.now();
  const frames = await runVisionDetect(DEFAULT_VISION_BIN, pngs, { run: { root: s.root, runId: "job_VISIONE2E", attempt: 1, registry: fileProcessRegistry(s.root) }, signal: new AbortController().signal });
  const ms = Date.now() - t0;
  const withFace = frames.filter((f) => f.faces.length > 0);
  console.log(`vision-detect: 10 кадров за ${ms} мс; лицо на ${withFace.length}; рамки ${withFace.map((f) => f.faces.map((x) => `${x.x.toFixed(2)},${x.y.toFixed(2)} ${x.w.toFixed(2)}×${x.h.toFixed(2)}`).join("/")).join("; ")}`);
  expect(withFace.length).toBeGreaterThanOrEqual(8);
  for (const f of withFace) {
    const big = [...f.faces].sort((a, b) => b.w * b.h - a.w * a.h)[0]!;
    expect(big.x).toBeGreaterThanOrEqual(0);
    expect(big.y).toBeGreaterThanOrEqual(0);
    expect(big.x + big.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(big.y + big.h).toBeLessThanOrEqual(1 + 1e-9);
    const area = big.w * big.h;
    expect(area).toBeGreaterThanOrEqual(0.01);
    expect(area).toBeLessThanOrEqual(0.4);
  }
}, 10 * 60_000);
