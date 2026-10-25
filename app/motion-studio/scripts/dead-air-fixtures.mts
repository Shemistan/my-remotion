// Фикстуры dead_air по живым сценам (ревью S15b, I-1): кадры временного прохода (kit 0.5.8) и
// яркость превью на сетке пробы для отрезков, где мерка «среднее |Δ| по содержимому» ошибалась.
// - s15b-5 (flow-graph), кадры 186–246: импульс едет по ребру, ячейки заполняются — движение есть;
// - s15a-1 (kinetic-quote), кадры 186–240: настоящий стоп-кадр.
// Версии только читаются. Проход берётся из logs.json перерендера (`s15-calibrate.mts` или
// `--render` здесь: рендер версии с пробой в tmp/dead-air-fixtures/), яркость — из превью версии.
// У s15b-5 проход в перерендере падает («Page crashed!» после ~200-го кадра, 3 из 3 запусков;
// в смоуке он прошёл целиком, 54 кадра), поэтому маска содержимого — один реальный кадр прохода
// (`mask`) на все сэмплы отрезка: смоук-QA на этом отрезке видел те же тексты и площадь (он и
// пометил dead_air), а проверяется именно мерка движения по яркости.
// Запуск: ./scripts/with-node.sh npx tsx scripts/dead-air-fixtures.mts [--render] [--s15a-logs=<logs.json калибровки S15a-1>]
// Выход: server/test/fixtures/dead-air/<name>.json (+ манифест источника внутри файла).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MotionSpec, Settings } from "@ms/contracts";
import { SWEEP_EVERY, gridDims, previewLuma, renderVersion } from "@ms/render";
import { parseSweep } from "../server/src/qa/temporal.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const OUT = join(REPO, "app", "motion-studio", "server", "test", "fixtures", "dead-air");
const TMP = join(REPO, "tmp", "dead-air-fixtures");
const SSD = "/Volumes/External SSD";
const render = process.argv.includes("--render");
const s15aLogs = process.argv.find((a) => a.startsWith("--s15a-logs="))?.slice("--s15a-logs=".length);

const CASES = [
  { name: "s15b-5-flow-graph", store: `${SSD}/MotionStudio-e2e-s15b`, evidence: "docs/evidence/script-mvp/s15b/smoke-block-1.json", n: 5, from: 186, to: 246, logs: undefined as string | undefined, mask: 198 as number | undefined },
  { name: "s15a-1-kinetic-quote", store: `${SSD}/MotionStudio-e2e-s15a`, evidence: "docs/evidence/script-mvp/s15a/smoke-block-1.json", n: 1, from: 186, to: 240, logs: s15aLogs, mask: undefined },
];

function findVersion(store: string, id: string): string | undefined {
  const root = join(store, "workspace", "projects");
  for (const p of readdirSync(root)) {
    const scenes = join(root, p, "scenes");
    if (!existsSync(scenes)) continue;
    for (const s of readdirSync(scenes)) {
      const v = join(scenes, s, "versions", id);
      if (existsSync(v)) return v;
    }
  }
  return undefined;
}

mkdirSync(OUT, { recursive: true });
mkdirSync(join(TMP, "cache"), { recursive: true });
for (const c of CASES) {
  const smoke = JSON.parse(readFileSync(join(REPO, c.evidence), "utf8")) as { scenes: { n: number; version_id: string; frames: { lead: number; speech: number; tail: number } }[] };
  const sc = smoke.scenes.find((s) => s.n === c.n)!;
  const dir = findVersion(c.store, sc.version_id);
  if (!dir) throw new Error(`${c.name}: версии ${sc.version_id} нет в ${c.store}`);
  const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")) as Settings;
  const spec = JSON.parse(readFileSync(join(dir, "spec.json"), "utf8")) as MotionSpec;
  const out = join(TMP, c.name);
  mkdirSync(out, { recursive: true });
  const logsPath = c.logs ?? join(out, "logs.json");
  if (render || !existsSync(logsPath)) {
    const r = await renderVersion({
      versionDir: dir, outDir: out, settings, cacheDir: join(TMP, "cache"), stills: [settings.duration_frames - 1], preview: { scale: 0.5, crf: 23 }, timeoutMs: 10 * 60_000,
      run: { root: c.store, runId: `dead-air-fixture-${c.name}`, attempt: 1 }, sweep: { every: SWEEP_EVERY, scale: 0.25 },
    });
    if (!r.ok) throw new Error(`${c.name}: рендер не удался: ${JSON.stringify(r.error)}`);
    writeFileSync(join(out, "logs.json"), JSON.stringify(r.browserLogs));
  }
  const real = parseSweep(JSON.parse(readFileSync(existsSync(logsPath) ? logsPath : join(out, "logs.json"), "utf8")) as string[]);
  const { gw, gh } = gridDims({ w: settings.width, h: settings.height });
  const motion = await previewLuma(join(dir, "preview.mp4"), { every: SWEEP_EVERY, w: gw, h: gh });
  let sweep = real.filter((f) => f.frame >= c.from && f.frame <= c.to);
  if (c.mask !== undefined) {
    const m = real.find((f) => f.frame === c.mask);
    if (!m) throw new Error(`${c.name}: нет кадра прохода ${c.mask} для маски`);
    sweep = motion.frames.filter((f) => f >= c.from && f <= c.to).map((frame) => ({ ...m, frame }));
  }
  const luma = sweep.map((f) => {
    const k = motion.frames.indexOf(f.frame);
    if (k < 0) throw new Error(`${c.name}: нет яркости кадра ${f.frame}`);
    return Buffer.from(motion.luma[k]!).toString("base64");
  });
  const fixture = {
    manifest: { source: `${c.store} ${sc.version_id}`, evidence: c.evidence, scene: c.n, frames: [c.from, c.to], ...(c.mask !== undefined ? { mask_from_sweep_frame: c.mask } : {}), sweep_every: SWEEP_EVERY, grid: [gw, gh], date: new Date().toISOString().slice(0, 10), records: sweep.length },
    window: sc.frames,
    beats: spec.beats,
    phases: spec.phases,
    sweep,
    luma,
  };
  writeFileSync(join(OUT, `${c.name}.json`), JSON.stringify(fixture) + "\n");
  console.log(`${c.name}: ${sweep.length} сэмплов (${sweep[0]?.frame}–${sweep.at(-1)?.frame})`);
}
