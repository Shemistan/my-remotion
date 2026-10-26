// Task 5L e2e: папка клипов видеопроекта реальным рендером (exportOne, ffmpeg/ffprobe) на КОПИИ
// хранилища приёмки 38-39 (`MS_DATA_DIR`, по умолчанию `materialsPath("e2e", "v5l")`; оригинал
// v38-video не трогается). Без вызовов claude: сцены уже сгенерированы и часть утверждена (C).
// Задача `video.package` (только утверждённые) → [A] на каждую вошедшую сцену MP4 (h264, размер
// версии, fps плана, aac) и, кроме fullscreen, альфа (prores 4444, yuva*, альфа угла 0);
// длительность файлов = шпаргалке ± 1 кадр; шпаргалка md/csv/txt — строк = принятых сцен плана,
// таймкоды ролика сверены с кадрами плана; неутверждённые — «не вошли». Копия папки для человека
// — `MS_V5L_EXAMPLES` (по умолчанию `materialsPath("examples", "phase4", "5L")`) + README.txt [H].
// Итог — docs/evidence/phase-5/5l/summary.json и шпаргалка.md.
// Запуск: `MS_E2E=1 ./scripts/with-node.sh npx vitest run server/test/video-scenes/video-package.e2e.test.ts`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Job, VideoPackageManifestSchema } from "@ms/contracts";
import { MARKER_FILE, assertSsdWriteAllowed, materialsPath } from "@ms/core";
import { alphaAtCorner, ensureRenderBrowser, ffprobe } from "@ms/render";
import { currentPlan } from "../../src/analysis/plan-ops.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as plans from "../../src/db/repos/plans.js";
import * as versions from "../../src/db/repos/versions.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue } from "../../src/jobs/queue.js";
import { newId } from "../../src/scenes/ids.js";
import { CHEAT_FILES } from "../../src/script/cheatsheet.js";
import { acceptedItems } from "../../src/video-scenes/batch.js";
import { timecode, videoCheatRows } from "../../src/video-scenes/cheatsheet.js";
import { planFps } from "../../src/video-scenes/context.js";
import { videoScenesState } from "../../src/video-scenes/state.js";

const T = 60 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const ROOT = process.env.MS_DATA_DIR ?? materialsPath("e2e", "v5l");
const EXAMPLES = process.env.MS_V5L_EXAMPLES ?? materialsPath("examples", "phase4", "5L");
const EVIDENCE = join(REPO, "docs/evidence/phase-5/5l");
const FINAL = ["completed", "failed", "cancelled", "blocked"];

let core: Core;
const mine = new Set<string>();
const log: string[] = [];
const say = (s: string) => {
  log.push(s);
  console.log(s);
};
const summary: Record<string, unknown> = {};

beforeAll(async () => {
  expect(existsSync(join(ROOT, MARKER_FILE)), `нет копии хранилища в ${ROOT}`).toBe(true);
  assertSsdWriteAllowed(ROOT);
  await ensureRenderBrowser();
  core = await bootCore({
    env: { ...process.env, MS_DATA_DIR: ROOT },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => registerHandlers(svc, { log: (l) => console.log(`  ${l}`) }),
    storageLog: (l) => console.log(`  [storage] ${l}`),
  });
}, T);

afterAll(async () => {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(EVIDENCE, "run.log"), log.join("\n") + "\n");
  await core?.close();
});

async function wait(id: string): Promise<Job> {
  mine.add(id);
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j && FINAL.includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

it("папка клипов: утверждённые сцены — MP4 + альфа, шпаргалка с таймкодами, копия для человека", async () => {
  const pid = process.env.MS_V5L_PROJECT
    ?? (core.db.prepare("SELECT p.id FROM projects p JOIN video_scenes v ON v.project_id = p.id GROUP BY p.id ORDER BY p.created_at DESC LIMIT 1").get() as { id: string } | undefined)?.id;
  expect(pid, "видеопроекта со сценами нет").toBeDefined();
  const plan = plans.byProject(core.db, pid!)!;
  const doc = currentPlan(core.db, ROOT, plan.id);
  const fps = planFps(core.db, doc);
  const accepted = acceptedItems(doc);
  const st = videoScenesState(core.db, ROOT, pid!);
  for (const s of st.scenes) say(`сцена ${s.item_id}: ${s.status}, v${s.version_number ?? "—"}, C ${s.approval.state}${s.approved_version_number ? ` v${s.approved_version_number}` : ""}, ${s.placement.mode}/${s.placement.zone}`);
  const approved = st.scenes.filter((s) => s.approval.state === "valid").map((s) => s.item_id);
  expect(approved.length, "нет утверждённых сцен — утвердите в приёмке 38-39").toBeGreaterThan(0);

  const t0 = Date.now();
  const job = enqueue(core.db, { type: "video.package", projectId: pid!, input: { projectId: pid!, only_approved: true }, idempotencyKey: `e2e-v5l-${newId("run")}` }).job;
  const done = await wait(job.id);
  const ms = Date.now() - t0;
  say(`video.package ${job.id}: ${done.status} за ${(ms / 1000).toFixed(1)} с ${done.error ? JSON.stringify(done.error) : ""}`);
  expect(done.status, JSON.stringify(done.error)).toBe("completed");
  const refs = done.output_refs as { package_id: string; rel_path: string; files: number; missing: { item_id: string; reason: string }[] };
  const dir = join(ROOT, refs.rel_path);
  const m = VideoPackageManifestSchema.parse(JSON.parse(readFileSync(join(dir, "package-manifest.json"), "utf8")));
  expect(m.scenes.map((s) => s.item_id).sort()).toEqual([...approved].sort());
  expect(m.missing.map((x) => x.item_id).sort()).toEqual(accepted.map((x) => x.id).filter((id) => !approved.includes(id)).sort());

  // [A] файлы: MP4 h264 + aac, размер версии, fps плана; альфа — ProRes 4444 yuva, угол прозрачен
  const rows = videoCheatRows(m);
  const files: Record<string, unknown>[] = [];
  for (const s of m.scenes) {
    const v = versions.get(core.db, s.version_id)!;
    const row = rows.find((r) => r.mp4 === s.mp4.file)!;
    const mp4 = await ffprobe(join(dir, s.mp4.file));
    expect(mp4).toMatchObject({ codec: "h264", audioCodec: "aac", width: v.settings.width, height: v.settings.height, fps });
    const frameMs = (1000 * fps.den) / fps.num;
    expect(Math.abs(mp4.durationMs - row.duration_s! * 1000), `${s.mp4.file}: длительность`).toBeLessThanOrEqual(frameMs + 1);
    const item = accepted.find((x) => x.id === s.item_id)!;
    expect(row.edited!.start).toBe(timecode(item.frames.start, fps));
    // исходник — куски под окном клипа по таймлайну EDL (fix I1), не source плана
    expect(s.source_pieces?.length, `${s.item_id}: куски исходника`).toBeGreaterThan(0);
    files.push({ file: s.mp4.file, sha256: s.mp4.sha256, ffprobe: mp4 });
    if (s.mode === "fullscreen") {
      expect(s.alpha).toBeNull();
      continue;
    }
    expect(s.alpha, `${s.item_id}: альфа`).not.toBeNull();
    const mov = await ffprobe(join(dir, s.alpha!.file));
    expect(mov.codec).toBe("prores");
    expect(mov.profile).toMatch(/4444/);
    expect(mov.pixFmt).toMatch(/^yuva/);
    expect(mov).toMatchObject({ width: v.settings.width, height: v.settings.height, fps });
    expect(Math.abs(mov.durationMs - row.duration_s! * 1000), `${s.alpha!.file}: длительность`).toBeLessThanOrEqual(frameMs + 1);
    const corner = await alphaAtCorner(join(dir, s.alpha!.file), 0);
    expect(corner).toBe(0);
    files.push({ file: s.alpha!.file, sha256: s.alpha!.sha256, ffprobe: mov, alpha_corner: corner });
  }

  // шпаргалки: строк = принятых сцен плана
  const csv = readFileSync(join(dir, CHEAT_FILES.csv), "utf8").slice(1).trimEnd().split("\r\n");
  expect(csv.length - 1).toBe(accepted.length);
  const txt = readFileSync(join(dir, CHEAT_FILES.txt), "utf8").trimEnd().split("\n");
  expect(txt).toHaveLength(accepted.length);
  const md = readFileSync(join(dir, CHEAT_FILES.md), "utf8");
  say(md);

  // [H] копия папки для человека + README.txt
  // примеры только добавляются: у каждого прогона своя папка (суффикс — конец id пакета)
  const folder = `${m.name}_${refs.package_id.slice(-6)}`;
  const out = join(EXAMPLES, folder);
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(dir)) copyFileSync(join(dir, f), join(out, f));
  const older = readdirSync(EXAMPLES, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== folder).map((e) => e.name).sort();
  writeFileSync(join(EXAMPLES, "README.txt"), readme(folder, m.scenes.length, m.missing.length, older));
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, "шпаргалка.md"), md);
  Object.assign(summary, {
    project_id: pid, plan: `${doc.plan_id}@r${doc.revision}`, fps, job_id: job.id, ms, package_id: refs.package_id, rel_path: refs.rel_path,
    scenes: m.scenes.map((s) => ({ n: s.n, item_id: s.item_id, version: s.version_number, approved: s.approved, mode: s.mode, zone: s.zone })),
    missing: m.missing.map(({ item_id, reason, n }) => ({ item_id, n, reason })), files, example: out,
  });
}, T);

function readme(name: string, clips: number, missing: number, older: readonly string[]): string {
  return [
    "Phase 5-lite (Task 5L) — папка клипов видеопроекта для своего монтажа",
    "",
    `АКТУАЛЬНАЯ папка — «${name}»: ${clips} клип(ов) — только сцены, утверждённые во вкладке «Сцены» (C); не вошли: ${missing} (причина — в шпаргалке).`,
    ...(older.length > 0 ? ["Остальные папки рядом — прежние сборки (старые формулировки шпаргалки), оставлены для сравнения:", ...older.map((o) => `  ${o}`)] : []),
    "Собрано задачей video.package на копии хранилища приёмки 38-39 (ролик MyProtocol, видеопроект «Приёмка видео»).",
    "",
    "Что внутри:",
    "  NN_<фраза>.mp4        — клип на весь кадр со своим фоном (H.264 + тихая дорожка AAC).",
    "  NN_<фраза>_alpha.mov  — тот же клип с прозрачностью (ProRes 4444 с альфой). У сцен «на весь кадр» его нет — не нужен.",
    "  шпаргалка.md / .csv / .txt — куда ставить каждый клип.",
    "  package-manifest.json — технический манифест (версии, sha256, ffprobe).",
    "",
    "Как вставлять (CapCut / Final Cut):",
    "  1. Откройте шпаргалку: колонка «ролик: начало» — таймкод смонтированного ролика ЧЧ:ММ:СС:КК (КК — кадр, 30 fps),",
    "     «исходник» — кусок исходного видео под клипом (если монтируете от исходника). Если клип склеен из нескольких",
    "     кусков исходника, там написано «2 куска — … + …; ставьте по началу, клип склеен».",
    "  2. Сцена «поверх видео / выноска / разделённый экран»: положите NN_..._alpha.mov дорожкой НАД видео с этого таймкода —",
    "     видео автора останется видно, графика встанет в свою зону (колонка «режим»).",
    "  3. Сцена «на весь кадр»: положите NN_....mp4 поверх видео (или вместо него) с этого таймкода.",
    "  4. Длительность клипа уже равна сцене плана; звук клипа — тишина, его можно отключить.",
    "  «утверждена (C): нет» — версия не утверждена; замечания — короткие подсказки проверки качества",
    "  (например, «кадр застыл», «пустая область кадра») и «без альфы: …», если альфа-версии нет.",
    "",
  ].join("\n");
}
