// Калибровка проверок S15b (одна сцена — один герой, проверки по всей сцене) на версиях прошлых
// смоуков: перерендер версии с пробой kit 0.5.8 (стоп-кадр N−1 + превью + временной проход) в
// tmp/, затем heroIssues / temporalIssues на её JSON и сверка с оценками дизайнера.
// Версии только читаются; вывод — tmp/s15-calibration.json и tmp/s15-calibration/<версия>/.
// Запуск: ./scripts/with-node.sh npx tsx scripts/s15-calibrate.mts [--reuse]
// (`--reuse` — не рендерить заново, взять browserLogs/превью прошлого прогона).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MotionSpec, Settings } from "@ms/contracts";
import { SWEEP_EVERY, gridDims, previewLuma, renderVersion, resolveStyle } from "@ms/render";
import { type HeroFrame, NO_HERO_SHARE, heroIssues, parseLayout } from "../server/src/qa/layout.js";
import { parseSweep, temporalIssues } from "../server/src/qa/temporal.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const OUT = join(REPO, "tmp", "s15-calibration");
const SSD = "/Volumes/External SSD";
const reuse = process.argv.includes("--reuse");

/** Сцены смоуков блока 1: оценка дизайнера (compare S14 и S15a) и судьи. */
const SCENES: { tag: string; store: string; evidence: string; designer: number[] }[] = [
  { tag: "S11", store: `${SSD}/MotionStudio-e2e-s11`, evidence: "docs/evidence/script-mvp/smoke-block-1.json", designer: [6, 6.5, 6, 6, 5] },
  { tag: "S14", store: `${SSD}/MotionStudio-e2e-s14`, evidence: "docs/evidence/script-mvp/s14/smoke-block-1.json", designer: [7, 7, 5.5, 6, 6.5] },
  { tag: "S15a", store: `${SSD}/MotionStudio-e2e-s15a`, evidence: "docs/evidence/script-mvp/s15a/smoke-block-1.json", designer: [7, 6, 5.5, 6, 5.5] },
];

interface SmokeScene {
  n: number;
  technique: string;
  version_id: string | null;
  frames: { lead: number; speech: number; tail: number; total: number };
  judge: { overall: number } | null;
}

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

mkdirSync(join(OUT, "cache"), { recursive: true });
const rows: Record<string, unknown>[] = [];
for (const set of SCENES) {
  const smoke = JSON.parse(readFileSync(join(REPO, set.evidence), "utf8")) as { scenes: SmokeScene[] };
  for (const sc of smoke.scenes) {
    if (!sc.version_id) continue;
    const dir = findVersion(set.store, sc.version_id);
    if (!dir) {
      console.log(`${set.tag} ${sc.n}: версии ${sc.version_id} нет`);
      continue;
    }
    const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")) as Settings;
    const spec = JSON.parse(readFileSync(join(dir, "spec.json"), "utf8")) as MotionSpec;
    const props = readFileSync(join(dir, "props.json"), "utf8");
    const out = join(OUT, `${set.tag}-${sc.n}`);
    mkdirSync(out, { recursive: true });
    const last = settings.duration_frames - 1;
    let logs: string[];
    if (reuse && existsSync(join(out, "logs.json"))) logs = JSON.parse(readFileSync(join(out, "logs.json"), "utf8")) as string[];
    else {
      const t0 = Date.now();
      const r = await renderVersion({
        versionDir: dir, outDir: out, settings, cacheDir: join(OUT, "cache"), stills: [last], preview: { scale: 0.5, crf: 23 }, timeoutMs: 10 * 60_000,
        run: { root: set.store, runId: `s15-calib-${set.tag}-${sc.n}`, attempt: 1 }, sweep: { every: SWEEP_EVERY, scale: 0.25 },
      });
      if (!r.ok) {
        console.log(`${set.tag} ${sc.n}: рендер не удался: ${JSON.stringify(r.error)}`);
        continue;
      }
      logs = r.browserLogs;
      writeFileSync(join(out, "logs.json"), JSON.stringify(logs));
      console.log(`${set.tag} ${sc.n} ${sc.technique}: рендер ${Math.round((Date.now() - t0) / 1000)} с`);
    }
    const sweep = parseSweep(logs);
    const hold = parseLayout(logs).find((f) => f.frame === last) as (ReturnType<typeof parseLayout>[number] & { heroes?: HeroFrame["heroes"] }) | undefined;
    const payoffIds = new Set((spec.phases ?? []).filter((p) => p.role === "payoff").map((p) => p.id));
    const payoffStart = Math.min(...spec.beats.filter((b) => b.phase !== undefined && payoffIds.has(b.phase)).map((b) => b.start_frame));
    const peakAt = Number.isFinite(payoffStart) ? payoffStart + 10 : undefined;
    const near = peakAt === undefined ? undefined : sweep.reduce<(typeof sweep)[number] | undefined>((a, f) => (!a || Math.abs(f.frame - peakAt) < Math.abs(a.frame - peakAt) ? f : a), undefined);
    const peak: HeroFrame | undefined = near ? { frame: near.frame, heroes: near.heroes, areas: near.areas } : undefined;
    const holdF: HeroFrame | undefined = hold ? { frame: hold.frame, heroes: hold.heroes ?? [], ...(hold.areas ? { areas: hold.areas } : {}) } : undefined;
    const metric = /"metric"\s*:/.test(props);
    const strict = heroIssues({ ...(peak ? { peak } : {}), ...(holdF ? { hold: holdF } : {}), technique: sc.technique, metric, blocking: { noHero: true, textDominant: true } });
    const { gw, gh } = gridDims({ w: settings.width, h: settings.height });
    let temporal: { code: string; severity: string; frame?: number; description: string }[] = [];
    try {
      const motion = await previewLuma(join(out, "preview.mp4"), { every: SWEEP_EVERY, w: gw, h: gh });
      const enter = resolveStyle({ preset: spec.style_preset, intensity: settings.animation_intensity, fps: spec.fps }).motion.enter_frames;
      temporal = temporalIssues(sweep, spec, { lead: sc.frames.lead, speech: sc.frames.speech, tail: sc.frames.tail }, motion, { enter });
    } catch (e) {
      console.log(`  энергия не посчитана: ${(e as Error).message.slice(0, 200)}`);
    }
    const row = {
      scene: `${set.tag}-${sc.n}`, technique: sc.technique, version_id: sc.version_id,
      designer: set.designer[sc.n - 1], judge: sc.judge?.overall ?? null,
      sweep_frames: sweep.length,
      hero_peak: peak ? { frame: peak.frame, top: peak.heroes.slice(0, 2).map((h) => `${h.kind}:${h.share}${h.accent ? "*" : ""}`) } : null,
      hero_hold: holdF ? { frame: holdF.frame, top: holdF.heroes.slice(0, 2).map((h) => `${h.kind}:${h.share}${h.accent ? "*" : ""}`), areas: holdF.areas ?? null } : null,
      hero_max: Math.max(peak?.heroes[0]?.share ?? 0, holdF?.heroes[0]?.share ?? 0),
      metric,
      hero_issues: strict.map((x) => `${x.code}:${x.severity}`),
      temporal: temporal.map((x) => `${x.code}:${x.severity}@${x.frame ?? ""}`),
      temporal_text: temporal.map((x) => `${x.code}: ${x.description}`),
    };
    rows.push(row);
    console.log(`  ${row.scene} d=${row.designer} hero_max=${row.hero_max} ${row.hero_issues.join(",")} | ${row.temporal.join(",")}`);
  }
}

/** Разделяет ли признак сцены дизайнера ≤ 5,5 и ≥ 7: все «плохие» с признаком, ни одной «хорошей». */
const low = rows.filter((r) => (r.designer as number) <= 5.5);
const high = rows.filter((r) => (r.designer as number) >= 7);
const sep = (has: (r: Record<string, unknown>) => boolean) => ({
  low_flagged: low.filter(has).map((r) => r.scene), low_total: low.length,
  high_flagged: high.filter(has).map((r) => r.scene), high_total: high.length,
  separates: low.every(has) && !high.some(has),
});
const code = (c: string) => (r: Record<string, unknown>) => (r.hero_issues as string[]).some((x) => x.startsWith(`${c}:blocking`));
const tcode = (c: string, sev?: string) => (r: Record<string, unknown>) => (r.temporal as string[]).some((x) => x.startsWith(`${c}:${sev ?? ""}`));
const summary = {
  no_hero: { threshold: NO_HERO_SHARE, ...sep(code("no_hero")) },
  text_dominant_strict: sep(code("text_dominant")),
  dead_air_blocking: sep(tcode("dead_air", "blocking")),
  empty_half_blocking: sep(tcode("empty_half", "blocking")),
  empty_half_any: sep(tcode("empty_half")),
  // лучший порог no_hero по hero_max: есть ли значение, ниже которого все «плохие» и ни одной «хорошей»
  hero_max: { low: low.map((r) => [r.scene, r.hero_max]), high: high.map((r) => [r.scene, r.hero_max]) },
};
writeFileSync(join(REPO, "tmp", "s15-calibration.json"), JSON.stringify({ date: new Date().toISOString(), summary, rows }, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
