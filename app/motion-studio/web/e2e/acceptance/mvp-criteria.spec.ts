// Критерии готовности Motion Playground (`09` §1): п. 1–3 по версиям Test 1–3 (knowledge-refs,
// ffprobe превью, static check + typecheck кода версии — только чтение), п. 4 и п. 5 — ссылки на
// resilience и restart, п. 6 — sha256 исходников KB «после» = «до». Evidence —
// docs/evidence/phase-1/mvp-criteria/.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { KnowledgeRef, Settings } from "@ms/contracts";
import { checkSceneDir } from "../../../server/src/scenes/static-check.js";
import { typecheckVersion } from "../../../server/src/scenes/typecheck.js";
import { APP, Checks, EVIDENCE, probe, state, versionDir } from "./helpers.js";

const readJson = <T>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;

export default function mvpCriteria(): void {
  test("критерии MVP 09 §1: knowledge-refs, ffprobe превью, проверки кода, KB не изменена", async () => {
    test.setTimeout(20 * 60_000);
    const c = new Checks("mvp-criteria");
    const st = state();
    const list = [
      ["test1 v1", st.test1?.versionId],
      ["test2 v1", st.test2?.versionId],
      ["test3 v2", st.test3?.v2.versionId],
      ["test3 v3", st.test3?.v3.versionId],
    ].filter((x): x is [string, string] => !!x[1]);
    expect(list.length, "версии Test 1–3").toBe(4);
    for (const [name, id] of list) {
      const dir = versionDir(id);
      const refs = readJson<KnowledgeRef[]>(join(dir, "knowledge-refs.json"));
      c.check(`p1.${name}`, `${name}: knowledge-refs ≥ 1 записи с repo, commit, license, strategy`, refs.length > 0 && refs.every((r) => r.repository && r.commit && r.license && r.strategy), refs.map((r) => `${r.kb_id} ${r.repository}@${r.commit} ${r.license} ${r.strategy}`));
      const s = readJson<Settings>(join(dir, "settings.json"));
      const p = probe(join(dir, "preview.mp4"));
      const fps = s.fps.num / s.fps.den;
      const [n, d] = p.video.r_frame_rate.split("/").map(Number) as [number, number];
      const ok = Math.abs(p.durationS * fps - s.duration_frames) <= 1 && p.video.width === Math.round(s.width) && p.video.height === Math.round(s.height) && Math.abs(n / d - fps) < 1e-6;
      c.check(`p2.${name}`, `${name}: превью renderMedia, ffprobe — длительность ± 1 кадр, размер и fps = настройкам`, ok,
        { duration_frames: s.duration_frames, probe_frames: Number((p.durationS * fps).toFixed(2)), size: `${p.video.width}×${p.video.height}`, settings: `${s.width}×${s.height}`, fps: p.video.r_frame_rate });
      const violations = await checkSceneDir(dir);
      const types = violations.length === 0 ? await typecheckVersion(dir) : [];
      c.check(`p3.${name}`, `${name}: static check и typecheck без ошибок`, violations.length === 0 && types.length === 0, { violations, types });
    }
    c.note("p4", "ошибка рендера показывается как ошибка с логами", "resilience/broken-scene/checks.json (p4.error, p4.no-preview)", "A");
    c.note("p5", "после перезапуска версии на месте, экспорт повторяется", "restart/checks.json", "A");
    let out: string;
    let code = 0;
    try {
      out = execFileSync(process.execPath, [join(APP, "scripts/kb-hashes.mjs"), "after", join(EVIDENCE, "mvp-criteria")], { cwd: APP, encoding: "utf8" });
    } catch (e) {
      code = 1;
      out = String((e as { stdout?: string }).stdout ?? e);
    }
    c.check("p6", "исходники KB не изменены: sha256 выборки до = после", code === 0, out.trim());
  });
}
