// Test 3 — Iterative Editing (`09` §4) через UI на сцене Test 2: чат «сделай всё в фиолетовых
// тонах» → v2; промпт Test 3 дословно → v3. Проверки [A] как в Task 18 Step 4 (parent, темп
// × 4/3, палитра v1, объём, композиция по spec/props и реестру кадра hold, gate, длительность);
// в UI история v1–v3, каждая открывается и играет; «Сравнить v2 ↔ v3» — /timing/duration_frames.
// Экспорт v3 MP4 (сверка после перезапуска — restart). Evidence — docs/evidence/phase-1/test3/.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { type MotionSpec, type ScenePropsBase, type StyleBible, type VersionManifest, scaleContentFrames } from "@ms/contracts";
import { checkPreserve, compareHoldLayout } from "../../../server/src/pipeline/preserve.js";
import {
  Checks, EVIDENCE, PURPLE, REUSE, TEST3, chatEditViaUi, collect, exportViaUi, jobCost, plain, plays, probe, renderFrames, reuseGenerated, saveState, shot, state, versionDir, writeEvidence,
} from "./helpers.js";

const readJson = <T>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;

interface V {
  id: string;
  dir: string;
  manifest: VersionManifest;
  spec: MotionSpec;
  props: ScenePropsBase;
  style: StyleBible & { depth?: number };
}
const load = (id: string): V => {
  const dir = versionDir(id);
  return {
    id, dir,
    manifest: readJson(join(dir, "manifest.json")), spec: readJson(join(dir, "spec.json")),
    props: readJson(join(dir, "props.json")), style: readJson(join(dir, "style.json")),
  };
};

/** Значение по пути вида `content.flows[0].travel` (пути `scaleContentFrames`). */
function at(content: unknown, path: string): unknown {
  let v: unknown = { content };
  for (const m of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) v = (v as Record<string, unknown> | undefined)?.[m[1] ?? m[2]!];
  return v;
}

export default function test3(): void {
  test("Test 3 — Iterative Editing: правки через чат, проверки 09 §4, история и сравнение", async ({ page }) => {
    test.setTimeout(90 * 60_000);
    const c = new Checks("test3");
    const t2 = state().test2;
    expect(t2?.versionId, "Test 3 идёт на сцене Test 2").toBeTruthy();
    const sceneId = t2!.sceneId;
    await page.goto(`/scenes/${sceneId}`);
    await expect(page.getByRole("heading", { name: /^v\d+$/, level: 1 })).toBeVisible();

    const prev = state().test3;
    const e2 = REUSE && prev?.v2?.versionId ? await reuseGenerated(page.request, prev.v2) : await chatEditViaUi(page, sceneId, PURPLE);
    c.check("v2.job", "правка «фиолетовые тона» completed", e2.status === "completed" && !!e2.versionId, e2);
    expect(e2.versionId).toBeTruthy();
    const e3 = REUSE && prev?.v3?.versionId ? await reuseGenerated(page.request, prev.v3) : await chatEditViaUi(page, sceneId, TEST3);
    saveState({ test3: { v2: plain(e2), v3: plain(e3) } });
    c.check("v3.job", "правка Test 3 completed", e3.status === "completed" && !!e3.versionId, e3);
    expect(e3.versionId).toBeTruthy();

    const [v1, v2, v3] = [load(t2!.versionId!), load(e2.versionId!), load(e3.versionId!)];
    c.check("v2.parent", "v2 от v1, палитра изменена", v2.manifest.parent_version_id === v1.id && JSON.stringify(v2.style.palette) !== JSON.stringify(v1.style.palette),
      { parent: v2.manifest.parent_version_id, plan: (v2.manifest.edit_plan as { path?: string } | null)?.path, palette: v2.style.palette });
    c.check("t3.parent", "v3 от текущей (v2)", v3.manifest.parent_version_id === v2.id, v3.manifest.parent_version_id);
    const want = Math.round(v2.spec.duration_frames / 0.75);
    c.check("t3.speed", "скорость −25 %: duration_frames × 4/3 ± 1", Math.abs(v3.spec.duration_frames - want) <= 1 && v3.manifest.settings.duration_frames === v3.spec.duration_frames,
      { v2: v2.spec.duration_frames, v3: v3.spec.duration_frames, want, settings: v3.manifest.settings.duration_frames });
    const beatsOk = v3.spec.beats.length === v2.spec.beats.length && v3.spec.beats.every((b, i) => Math.abs(b.end_frame - Math.round(v2.spec.beats[i]!.end_frame / 0.75)) <= 1);
    c.check("t3.beats", "границы битов × 4/3 ± 1 кадр", beatsOk, v3.spec.beats.map((b, i) => `${b.id}: ${v2.spec.beats[i]?.end_frame} → ${b.end_frame}`));
    c.check("t3.palette", "палитра = токены v1", JSON.stringify(v3.style.palette) === JSON.stringify(v1.style.palette), { v1: v1.style.palette, v3: v3.style.palette });
    const depth = (v: V) => v.props.style.depth;
    c.check("t3.depth", "карточки объёмнее: depth вырос", (depth(v3) ?? 0) > (depth(v2) ?? 0), { v2: depth(v2), v3: depth(v3) }, "A+H");
    const size = { width: v3.manifest.settings.width, height: v3.manifest.settings.height };
    const preserve = checkPreserve(v2.spec, v3.spec, v2.props, v3.props, ["composition"], 0.02, { size });
    c.check("t3.composition", "композиция: позиции узлов spec/props ± 2 % кадра", preserve.length === 0, preserve);
    const last = (v: V) => v.spec.duration_frames - 1;
    const [h1, h2, h3] = [await renderFrames(v1.id, [last(v1)], "t3-hold-v1"), await renderFrames(v2.id, [last(v2)], "t3-hold-v2"), await renderFrames(v3.id, [last(v3)], "t3-hold-v3")];
    const lay2 = h2.layout.find((f) => f.frame === last(v2));
    const lay3 = h3.layout.find((f) => f.frame === last(v3));
    const holdDiff = lay2 && lay3 ? compareHoldLayout(lay2, lay3, size) : ["нет реестра раскладки кадра hold"];
    c.check("t3.hold", "кадр hold v2 ↔ v3: тексты на тех же местах (реестр раскладки)", holdDiff.length === 0 && (lay2?.items.length ?? 0) > 0, { v2: lay2?.items.length, v3: lay3?.items.length, diff: holdDiff }, "A+H");
    const log = readFileSync(join(v3.dir, "pipeline-log.json"), "utf8");
    c.check("t3.hold-pipeline", "пайплайн правки сам сверил кадр hold с базой", /сверка кадра hold базы \d+ ↔ \d+: \d+ → \d+ текстов, расхождений 0/.test(log), /сверка кадра hold[^"]*/.exec(log)?.[0] ?? "нет строки");
    const plan = v3.manifest.edit_plan as { path?: string; timing_scale?: number } | null;
    if (plan?.path === "param") {
      const factor = plan.timing_scale ?? v3.spec.duration_frames / v2.spec.duration_frames;
      const scaled = scaleContentFrames(v2.props.content, factor);
      const bad = scaled.scaled.filter((p) => at(v3.props.content, p) !== at(scaled.content, p));
      c.check("t3.content-frames", "кадровые величины content × 4/3 (travel, stagger…)", scaled.scaled.length > 0 && bad.length === 0, { factor, scaled: scaled.scaled.length, bad });
    } else {
      c.note("t3.content-frames", "путь правки не param — кадровые величины переписал Engineer", plan);
    }
    c.check("t3.gate", "технический gate pass", v3.manifest.qa?.technical === "pass", v3.manifest.qa);
    const p3 = probe(join(v3.dir, "preview.mp4"));
    // превью — в половинном разрешении (docs/architecture/README.md); полный размер — у экспорта
    c.check("t3.duration", "превью v3: длительность ± 1 кадр, размер = настройки × 0,5", Math.abs(p3.durationS * 30 - v3.spec.duration_frames) <= 1 && p3.video.width === 960 && p3.video.height === 540, p3);

    // кадры hold v1/v2/v3 рядом (по 640 px)
    const holdPng = join(EVIDENCE, "test3/hold-v1-v2-v3.png");
    execFileSync("ffmpeg", ["-y", "-v", "error",
      "-i", join(h1.out, "frames", `${last(v1)}.png`), "-i", join(h2.out, "frames", `${last(v2)}.png`), "-i", join(h3.out, "frames", `${last(v3)}.png`),
      "-filter_complex", "[0]scale=640:-1[a];[1]scale=640:-1[b];[2]scale=640:-1[c];[a][b][c]hstack=inputs=3", holdPng]);

    // UI: история v1–v3, каждая открывается и проигрывается
    await page.goto(`/scenes/${sceneId}`);
    const history = page.getByRole("region", { name: "История версий" });
    await expect(history.getByRole("listitem")).toHaveCount(3);
    for (const [n, v] of [[1, v1], [2, v2], [3, v3]] as const) {
      // «Открыть» есть у всех, кроме уже открытой (текущей v3 при входе)
      const open = history.locator(`[data-version-id="${v.id}"] button[data-action="open"]`);
      if (await open.isEnabled()) await open.click();
      await expect(page.getByRole("heading", { name: `v${n}`, level: 1 })).toBeVisible();
      const t = await plays(page);
      c.check(`ui.v${n}`, `v${n} открывается и проигрывается`, t > 0.5, `currentTime ${t.toFixed(2)}`);
    }
    await shot(page, "test3", "01-history-v3");
    // «Сравнить v2 ↔ v3»
    await history.locator(`[data-version-id="${v2.id}"] button[data-action="open"]`).click();
    await expect(page.getByRole("heading", { name: "v2", level: 1 })).toBeVisible();
    await history.locator(`[data-version-id="${v3.id}"] button[data-action="compare"]`).click();
    await expect(page.getByRole("heading", { name: "Сравнение версий" })).toBeVisible();
    const row = page.locator(".diff-block").filter({ has: page.getByRole("heading", { name: "Props" }) }).locator("tr", { hasText: "/timing/duration_frames" });
    const rowText = (await row.first().textContent().catch(() => "")) ?? "";
    c.check("ui.compare", "сравнение v2 ↔ v3: /timing/duration_frames было → стало", rowText.includes(String(v2.spec.duration_frames)) && rowText.includes(String(v3.spec.duration_frames)), rowText);
    await shot(page, "test3", "02-compare-v2-v3");

    // экспорт v3 MP4 до перезапуска (restart сверит повтор)
    await page.goto(`/scenes/${sceneId}?v=${v3.id}`);
    await expect(page.getByRole("heading", { name: "v3", level: 1 })).toBeVisible();
    const ex = await exportViaUi(page, "mp4");
    c.check("t3.export", "экспорт v3 MP4 до перезапуска", ex.probe.video.codec_name === "h264", ex.probe);
    saveState({ test3: { v2: plain(e2), v3: plain(e3), exportId: ex.exportId, exportProbe: ex.probe } });

    collect(v2.id, join(EVIDENCE, "test3/v2"));
    collect(v3.id, join(EVIDENCE, "test3/v3"));
    collect(ex.exportId, join(EVIDENCE, "test3/export-v3"));
    writeEvidence("test3", "summary.json", { scene: sceneId, v1: v1.id, v2: { ...e2, cost_usd: jobCost(e2.jobId) }, v3: { ...e3, cost_usd: jobCost(e3.jobId) }, exportId: ex.exportId });
  });
}
