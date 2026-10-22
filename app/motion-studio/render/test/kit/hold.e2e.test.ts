// Галерея финалов motion-kit 0.5.0 (hold engine): реальный рендер 1920×1080, 180 кадров,
// hold 128–180. Каждый носитель итога (граф, график, гонка, таймлайн, число) в своих
// режимах удержания и контроль без hold. Проверка: между N−20 и N−1 самый живой тайл
// меняется заметно сильнее шума фона и застывшего контроля, рендер без ошибок.
// Кадры кладутся в tmp/hold-gallery/<вариант>/ (листы галереи, фикстуры QA).
// Запуск: `make e2e`. Пишет только в tmp/ репозитория.
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ensureRenderBrowser } from "../../src/node/browser.js";
import { probeGate } from "../../src/node/ffprobe.js";
import { type RenderRequest, renderVersion } from "../../src/node/render-version.js";
import { FIXTURES, REPO_TMP, copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "../helpers.js";

const T = 900_000;
// 127–129 — вход в удержание: непрерывность акцента (S3-fix C1)
const STILLS = [0, 100, 127, 128, 129, 140, 150, 160, 170, 179];
const OUT = join(REPO_TMP, "hold-gallery");

/** Вариант галереи: носитель × режим (`none` — финал без hold, контроль) и опции S3-fix. */
interface Variant { tag?: string; preset?: "light-clean"; emphasis?: boolean; inHold?: boolean; stale?: boolean }
const VARIANTS: [string, string, Variant?][] = [
  ["graph", "none"], ["graph", "steady-flow"], ["graph", "repeat-result"], ["graph", "now-pulse"], ["graph", "data-shimmer"],
  ["chart", "none"], ["chart", "data-shimmer"], ["chart", "now-pulse"], ["chart", "repeat-result"],
  ["race", "none"], ["race", "repeat-result"], ["race", "steady-flow"], ["race", "now-pulse"],
  ["timeline", "none"], ["timeline", "now-pulse"], ["timeline", "data-shimmer"],
  ["number", "none"], ["number", "settle-push"], ["number", "now-pulse"],
  // S3-fix: негатив QA frozen — у схемы дышит только ореол узла (акцент payoff, без hold)
  ["graph", "none", { tag: "emph", emphasis: true }],
  // held-queue: потоки с бита hold, steady-flow ведёт их (было frozen@179)
  ["graph", "steady-flow", { tag: "inhold", inHold: true }],
  // светлый пресет: тонкие волны и блики с меньшим контрастом чернил
  ["graph", "none", { tag: "light", preset: "light-clean" }], ["graph", "now-pulse", { tag: "light", preset: "light-clean" }],
  ["graph", "data-shimmer", { tag: "light", preset: "light-clean" }], ["graph", "steady-flow", { tag: "light", preset: "light-clean" }],
  ["graph", "repeat-result", { tag: "light", preset: "light-clean" }],
  // RadarRing в голом svg, в группе с фильтром, в сдвинутом слое (I4: Page crashed в LatencyRace)
  ["radar", "now-pulse"],
  // S3-fix2 I1: steady-flow, а потоки кончились за 2 с до hold, дышит только ореол «Учёта» —
  // негатив: метки пробы нет, kit предупреждает (фикстура QA graph-steady-flow-stale)
  ["graph", "steady-flow", { tag: "stale", stale: true, emphasis: true }],
  // S3-fix2 I2: поток вне графа — PulseAlongPath segments со своим hold — метит steady-flow
  ["path", "steady-flow"],
];

/** Метки hold engine пробы кадра `frame` (строка `[motion-kit:layout]` логов). */
const holdsAt = (logs: string[], frame: number): string[] | undefined => {
  for (const l of logs) {
    const i = l.indexOf("[motion-kit:layout]");
    if (i < 0) continue;
    const f = JSON.parse(l.slice(i + "[motion-kit:layout]".length)) as { frame: number; holds?: string[] };
    if (f.frame === frame) return f.holds;
  }
  return undefined;
};

const base = JSON.parse(readFileSync(join(FIXTURES, "hold-gallery", "props.json"), "utf8")) as { content: Record<string, unknown>; style: Record<string, unknown> };
const gray = (png: string) => execFileSync("ffmpeg", ["-v", "error", "-i", png, "-vf", "scale=480:270:flags=area,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 });
/**
 * Самый живой тайл 16×16 (480×270): средняя |ΔY| двух кадров в тайле, максимум по кадру
 * (0..255). Фон (зерно, дрейф пятен) даёт ровный малый фон, движение объекта — пик.
 */
const diff = (a: Buffer, b: Buffer) => {
  const W = 480;
  const Hh = 270;
  let best = 0;
  for (let ty = 0; ty + 16 <= Hh; ty += 8) {
    for (let tx = 0; tx + 16 <= W; tx += 8) {
      let s = 0;
      for (let y = ty; y < ty + 16; y++) for (let x = tx; x < tx + 16; x++) s += Math.abs(a[y * W + x]! - b[y * W + x]!);
      best = Math.max(best, s / 256);
    }
  }
  return best;
};

let tmp: string;
let req: RenderRequest;
const result = new Map<string, number>();

beforeAll(async () => {
  await ensureRenderBrowser();
  tmp = await makeTmp();
  const cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  await mkdir(OUT, { recursive: true });
  req = {
    versionDir: "",
    settings: await fixtureSettings("hold-gallery"),
    cacheDir,
    stills: STILLS,
    preview: { scale: 0.5, crf: 23 },
    timeoutMs: 300_000,
    run: { root: await makeStore(tmp), runId: "hold", attempt: 1 },
  };
}, T);

afterAll(async () => {
  console.log("Δ N−20…N−1 (480×270, 0..255):", JSON.stringify(Object.fromEntries(result)));
  if (tmp) await removeTmp(tmp);
});

// HOLD_ONLY=graph,race — часть носителей (отладка)
const ONLY = process.env.HOLD_ONLY?.split(",");
it.each(VARIANTS.filter(([c]) => !ONLY || ONLY.includes(c)))("%s × %s %o: рендер ok, финал живой", async (carrier, mode, v = {}) => {
  const name = `${carrier}-${mode}${v.tag ? `-${v.tag}` : ""}`;
  const dir = await copyFixture("hold-gallery", join(tmp, name));
  // контроль — без камеры: в финале движется только фон
  const style = { ...base.style, ...(v.preset ? { preset: v.preset } : {}) };
  writeFileSync(join(dir, "props.json"), JSON.stringify({ ...base, style, content: { carrier, mode, ...(mode === "none" ? { camera: false } : {}), ...(v.emphasis ? { emphasis: true } : {}), ...(v.inHold ? { inHold: true } : {}), ...(v.stale ? { stale: true, camera: false } : {}) } }));
  const r = await renderVersion({ ...req, versionDir: dir, run: { ...req.run, runId: name } });
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
  expect(probeGate(r.probe!, req.settings, 0.5)).toEqual([]);
  const errors = r.browserLogs.filter((l) => l.startsWith("[error]"));
  // метки пробы (S3-fix2): режим метит тот, кто в кадре его рисует
  const holds = holdsAt(r.browserLogs, 179);
  result.set(`${name}:holds`, (holds ?? []).length);
  if (v.stale) {
    expect(errors.join("\n")).toMatch(/steady-flow: ни один поток графа не продолжается/);
    expect(holds).toEqual([]);
  } else {
    expect(errors.slice(0, 3).join("\n")).toBe("");
    if (mode !== "none" && carrier !== "number" && carrier !== "radar") expect(holds, `${name}: метка режима в N−1`).toContain(mode);
    if (mode === "none") expect(holds, `${name}: без hold меток нет`).toEqual([]);
  }
  await mkdir(join(OUT, name), { recursive: true });
  STILLS.forEach((f, i) => copyFileSync(r.stills[i]!, join(OUT, name, `${f}.png`)));
  copyFileSync(r.previewPath!, join(OUT, `${name}.mp4`));
  const d = diff(gray(r.stills[STILLS.indexOf(160)]!), gray(r.stills[STILLS.indexOf(179)]!));
  result.set(name, Number(d.toFixed(3)));
  // вход в удержание: кадр 127 → 128 меняется не сильнее соседнего шага 128 → 129 с запасом —
  // ореол не гаснет и не вспыхивает на кадр (S3-fix C1; до правки number-*: провал ореола)
  const still = (f: number) => gray(r.stills[STILLS.indexOf(f)]!);
  const entry = diff(still(127), still(128));
  const next = diff(still(128), still(129));
  result.set(`${name}:entry`, Number(entry.toFixed(3)));
  if (v.stale) return;
  if (mode !== "none") expect(entry, `${name}: скачок на входе в удержание (${entry} при шаге ${next})`).toBeLessThan(Math.max(4, next * 2.5));
  if (mode !== "none") {
    const ctl = result.get(`${carrier}-none${v.tag ? `-${v.tag}` : ""}`);
    // движение заметно выше шума фона (≈ 1–2); где контроль застыл (граф, график, гонка) —
    // в разы живее его. Таймлайн и число и без hold дышат акцентом (kit 0.4) — там только порог
    expect(d, `${name}: финал не движется`).toBeGreaterThan(3);
    if (ctl !== undefined && ctl < 3) expect(d, `${name}: финал не живее контроля (${ctl})`).toBeGreaterThan(ctl * 2.5);
  }
}, T);
