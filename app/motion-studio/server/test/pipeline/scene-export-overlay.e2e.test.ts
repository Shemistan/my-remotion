// Приёмка S6 по-настоящему: непрозрачная версия kit (фон — только <Background>) → задача
// `scene.export` с `overlay` через очередь и раннер на реальном хранилище (внешний SSD):
// ProRes 4444 с альфой перерендером, ffprobe, альфа угла и покрытие альфой. Без LLM.
// Версии — MS_E2E_S6_VERSIONS=<ver_…,ver_…> или две последние ready-версии с <Background> без
// заливки корня. Evidence: кадр hold поверх шахматки и (если доступен ролик человека,
// согласие 2026-10-24, только чтение) поверх светлого и тёмного кадра MyProtocol —
// полноразмерные в tmp/script-mvp/overlay/, ≤ 480 px — в docs/evidence/script-mvp/overlay/.
// Запуск: `MS_E2E=1 vitest run server/test/pipeline/scene-export-overlay.e2e.test.ts`.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ExportManifestSchema, type Job, ScenePropsBaseSchema } from "@ms/contracts";
import { alphaAtCorner, ensureRenderBrowser, ffprobe } from "@ms/render";
import { type Core, bootCore } from "../../src/boot.js";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue } from "../../src/jobs/queue.js";
import { newId } from "../../src/scenes/ids.js";
import { rootFillIssues } from "../../src/script/overlay-check.js";
import { materialsPath, materialsRoot, assertSsdWriteAllowed, SSD_ROOT } from "@ms/core";

const T = 60 * 60_000;
const DATA_DIR = process.env.MS_DATA_DIR ?? materialsPath("store");
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const FULL = join(REPO, "tmp/script-mvp/overlay");
const SMALL = join(REPO, "docs/evidence/script-mvp/overlay");
/** Ролик человека (согласие 2026-10-24): только чтение, кадры — в tmp/. */
const FOOTAGE = process.env.MS_E2E_S6_FOOTAGE ?? `${SSD_ROOT}/Youtube/FinalVideo/MyProtocol/MyProtocol.mov`;
/** Светлый кадр (белая рубашка на красной стене) и тёмный (тёмная IDE), с. */
const LIGHT_S = 1800;
const DARK_S = 2400;

let core: Core;
const mine = new Set<string>();
const lines: string[] = [];

beforeAll(async () => {
  expect(existsSync(materialsRoot()), "внешний SSD не подключён").toBe(true);
  assertSsdWriteAllowed(DATA_DIR); // S18: на SSD — только в папке материалов
  await ensureRenderBrowser();
  core = await bootCore({
    env: { ...process.env, MS_DATA_DIR: DATA_DIR },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => registerHandlers(svc, { log: (l) => console.log(`  ${l}`) }),
    storageLog: (l) => console.log(`  [storage] ${l}`),
  });
  mkdirSync(FULL, { recursive: true });
  mkdirSync(SMALL, { recursive: true });
}, T);

afterAll(async () => {
  if (lines.length > 0) {
    const readme = ["# S6: ProRes 4444 с альфой из непрозрачной версии — реальное хранилище", "", `Прогон ${new Date().toISOString()}.`, "", ...lines, ""].join("\n");
    writeFileSync(join(SMALL, "README.md"), readme);
    console.log(readme);
  }
  await core?.close();
});

/** Непрозрачные ready-версии kit: <Background> в src, без заливки корня, props по договору. */
function candidates(): versions.VersionRow[] {
  const ids = process.env.MS_E2E_S6_VERSIONS?.split(",").filter(Boolean);
  if (ids) return ids.map((id) => versions.get(core.db, id)!);
  const rows = core.db.prepare("SELECT id FROM scene_versions WHERE status = 'ready' ORDER BY created_at DESC, rowid DESC LIMIT 200").all() as { id: string }[];
  const out: versions.VersionRow[] = [];
  for (const { id } of rows) {
    const v = versions.get(core.db, id)!;
    const dir = join(DATA_DIR, v.path);
    try {
      const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
      if (settings.transparent_export !== false || settings.width !== 1920) continue;
      if (!ScenePropsBaseSchema.safeParse(JSON.parse(readFileSync(join(dir, "props.json"), "utf8"))).success) continue;
      const files = readdirSync(join(dir, "src")).filter((f) => f.endsWith(".tsx")).map((f) => ({ path: `src/${f}`, text: readFileSync(join(dir, "src", f), "utf8") }));
      if (!files.some((f) => f.text.includes("<Background")) || rootFillIssues(files).length > 0) continue;
    } catch {
      continue;
    }
    // разные сцены и запросы, не правки одной сцены
    if (out.some((x) => x.scene_id === v.scene_id || x.prompt === v.prompt) || /^restore /.test(v.prompt ?? "")) continue;
    out.push(v);
    if (out.length === 2) break;
  }
  return out;
}

async function wait(id: string): Promise<Job> {
  mine.add(id);
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const ff = (...args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);

it("непрозрачная версия kit → overlay ProRes 4444: prores/4444/yuva, альфа угла 0, покрытие в (0,5 %; 92 %); композиты поверх видео", async () => {
  const vs = candidates();
  expect(vs.length, "нет непрозрачных ready-версий kit с <Background>").toBeGreaterThan(0);
  const footage = existsSync(FOOTAGE);
  if (footage) {
    // кадры ролика человека — копией в tmp/, оригинал только читается
    ff("-ss", String(LIGHT_S), "-i", FOOTAGE, "-frames:v", "1", "-vf", "scale=1920:1080", join(FULL, "bg-light.png"));
    ff("-ss", String(DARK_S), "-i", FOOTAGE, "-frames:v", "1", "-vf", "scale=1920:1080", join(FULL, "bg-dark.png"));
  }
  ff("-f", "lavfi", "-i", "color=c=gray:s=1920x1080,format=gray", "-vf", "geq=lum='if(mod(floor(X/40)+floor(Y/40)\\,2)\\,200\\,140)',format=rgb24", "-frames:v", "1", join(FULL, "bg-checker.png"));

  for (const [k, v] of vs.entries()) {
    const name = `s${k + 1}`;
    const projectId = scenes.get(core.db, v.scene_id)!.project_id;
    const request = { format: "prores4444" as const, crf: 18, scale: 1 as const, overlay: true };
    const t0 = Date.now();
    const id = enqueue(core.db, { type: "scene.export", projectId, versionId: v.id, input: { versionId: v.id, request }, idempotencyKey: `e2e-s6-${newId("run")}` }).job.id;
    const job = await wait(id);
    const ms = Date.now() - t0;
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const ex = exportsRepo.get(core.db, (job.output_refs as { export_id: string }).export_id)!;
    const file = join(DATA_DIR, ex.path);
    const m = ExportManifestSchema.parse(JSON.parse(readFileSync(join(dirname(file), "export-manifest.json"), "utf8")));
    // [A] файл — ProRes 4444 с альфой
    const p = await ffprobe(file);
    expect(p.codec).toBe("prores");
    expect(p.pixFmt).toMatch(/^yuva444p1[02]le$/);
    expect(p.profile).toMatch(/4444/);
    expect(await alphaAtCorner(file, 30)).toBe(0);
    expect(m.overlay!.coverage).toBeGreaterThan(0.005);
    expect(m.overlay!.coverage).toBeLessThan(0.92);
    expect(m.settings.transparent_export).toBe(true);
    lines.push(
      `- ${name}: версия ${v.id} (v${v.number}) «${(v.prompt ?? "").slice(0, 80)}» → ${ex.id}, ${(ms / 1000).toFixed(1)} с; ` +
      `${p.codec} ${p.profile} ${p.pixFmt}; покрытие ${(m.overlay!.coverage * 100).toFixed(1)} %, дымка ${(m.overlay!.haze * 100).toFixed(1)} %, кадры ${m.overlay!.frames.join(", ")}` +
      `${m.warnings?.length ? `; предупреждения: ${m.warnings.join(" | ")}` : ""}`,
    );
    // [H] кадр hold поверх шахматки, светлого и тёмного кадра видео
    const hold = Math.max(...m.overlay!.frames);
    const bgs = ["checker", ...(footage ? ["light", "dark"] : [])];
    for (const bg of bgs) {
      const full = join(FULL, `${name}-over-${bg}.png`);
      ff("-i", join(FULL, `bg-${bg}.png`), "-i", file, "-filter_complex", `[1:v]select=eq(n\\,${hold}),setpts=PTS-STARTPTS,format=rgba[o];[0:v][o]overlay=0:0:format=auto,format=rgb24`, "-frames:v", "1", full);
      ff("-i", full, "-vf", "scale=480:-2", join(SMALL, `${name}-over-${bg}.png`));
    }
  }
}, T);
