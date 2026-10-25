// Task 34 Step 8: «Построить план» с агентом (Visual Planner, реальный claude) → [A] у каждой сцены
// ≥ 1 цитата с id слов (`verifyQuote`), `edited`/`source`/`frames` согласованы (`frames.start =
// usToFrame(edited.start_us)`, `editedToSource(edited.start_us) = source.start_us`); есть решение
// `skip` с причиной; нет overlay/callout/pip поверх лица без `override_reason` (и пересчёт перекрытия
// по рамке лица анализа видеоряда); покрытие ≤ 40 % (как вёл себя агент — фиксируется, не
// подгоняется); сцена с числом из речи (если числа есть); StyleBible проходит контраст →
// [H→агент] ключевое слово звучит внутри диапазона сцены (по таймкодам слов) и полезность сцен —
// выгрузка `plan/review.txt`, фрагменты превью ≤ 30 с и кадры раскладки — человеку → через UI:
// сменить режим одной сцены, отклонить одну, добавить свою по выделенным словам, поправить стиль,
// решить остальные (blocking — разрешить честно, с записью) → «Утвердить визуальный план (B)».
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  type EdlDto, type FootageDto, type Job, type NormRect, type PlanDto, type ProjectStyleDto, type ScenePlanItem, type SemanticDto, type TranscriptDto, type VideoProjectDto,
  ZONE_RECTS, type Zone, editedToSource, usToFrame, verifyQuote,
} from "@ms/contracts";
import { ACC_ROOT, APP, Checks, EVIDENCE3, agentRuns, db, getJson, jobEvents, runFile, shot, state, timing, waitJob, writeEvidence } from "./helpers.js";
import { EXAMPLES3 } from "./phase3-analysis.spec.js";

const OVER_AUTHOR = new Set(["overlay", "callout", "pip"]);
const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";
type AgentInfo = { status: string; calls: number; cost_usd: number } | undefined;
const agentOf = (j: Job): AgentInfo => (j.output_refs as { agent?: AgentInfo } | null)?.agent;
const inter = (a: NormRect, b: NormRect): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
const s1 = (us: number) => (us / 1e6).toFixed(1);
const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/%/g, "\\%").replace(/,/g, "\\,");

/** Шоты анализа, пересекающие source-диапазон сцены. */
const shotsOf = (ftg: FootageDto["analysis"], r: { start_us: number; end_us: number }) => ftg.shots.filter((s) => s.source_start_us < r.end_us && r.start_us < s.source_end_us);

/** Перекрытие лица и рук рамкой сцены по анализу видеоряда (независимо от расчёта плана). */
function overlapOf(ftg: FootageDto["analysis"], x: ScenePlanItem) {
  const shots = shotsOf(ftg, x.source);
  const face = Math.max(0, ...shots.filter((s) => s.face.union).map((s) => inter(x.rect, s.face.union!) / (s.face.union!.w * s.face.union!.h)));
  const wins = shots.flatMap((s) => s.windows.filter((w) => w.start_us < x.source.end_us && x.source.start_us < w.end_us));
  const hands = Math.max(0, ...wins.filter((w) => w.hands).map((w) => inter(x.rect, w.hands!) / (w.hands!.w * w.hands!.h)));
  return { face: Math.round(face * 1000) / 1000, hands: Math.round(hands * 1000) / 1000 };
}

export default function plan(): void {
  test("Step 8: визуальный план с агентом, правки через UI, StyleBible, Approval B", async ({ page }) => {
    const c = new Checks("plan", EVIDENCE3);
    const projectId = state().projectId!;
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("tab", { name: "План", exact: true }).click();
    const planAgent = page.locator(".plan-panel").getByRole("checkbox", { name: "С агентом (LLM)" });
    await expect(planAgent).toBeChecked();
    const t0 = Date.now();
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/plan\/generate$/.test(r.url())),
      page.getByRole("button", { name: "Построить план" }).click(),
    ]);
    expect([200, 202], await resp.text()).toContain(resp.status());
    const pj = await waitJob(page.request, ((await resp.json()) as { job: Job }).job.id, 45 * 60_000);
    const agent = agentOf(pj);
    timing("plan.visual", { wall_ms: Date.now() - t0, cost_usd: agent?.cost_usd ?? 0 });
    writeEvidence("plan", "job.json", { job: pj, agent_runs: agentRuns(pj.id), events: jobEvents(pj.id) }, EVIDENCE3);
    c.check("8.1", "план с агентом построен (Visual Planner вызван)", pj.status === "completed" && agent?.status === "completed" && agent.calls > 0, { status: pj.status, error: pj.error, output: pj.output_refs });

    const v = await getJson<VideoProjectDto>(page.request, `/api/projects/${projectId}/video`);
    const planId = v.plan!.id;
    const p0 = await getJson<PlanDto>(page.request, `/api/plans/${planId}`);
    const edl = await getJson<EdlDto>(page.request, `/api/edls/${p0.doc.inputs.edl.id}`);
    const tr = await getJson<TranscriptDto>(page.request, `/api/transcripts/${p0.doc.inputs.transcript.id}`);
    const ftg = (await getJson<FootageDto>(page.request, `/api/footage/${p0.doc.inputs.footage_id}`)).analysis;
    const sem = (await getJson<SemanticDto>(page.request, `/api/semantic/${p0.doc.inputs.semantic_id}`)).semantic;
    const style = await getJson<ProjectStyleDto>(page.request, `/api/projects/${projectId}/style`);
    writeEvidence("plan", `plan-r${p0.current_revision}-agent.json`, p0, EVIDENCE3);
    writeEvidence("plan", "style-agent.json", style, EVIDENCE3);
    const words = tr.doc.words;
    const tl = edl.timeline;
    const fps = edl.doc.timeline_fps;
    const items = p0.doc.items;
    c.check("8.2", "план опирается на текущую EDL (утверждённую A) и текущий транскрипт", p0.doc.inputs.edl.revision === edl.current_revision && p0.inputs_fresh.edl && p0.inputs_fresh.transcript, p0.doc.inputs);
    c.check("8.3", "в плане есть сцены агента", items.length > 0 && items.every((x) => x.origin === "agent"), { items: items.length, skipped: p0.doc.skipped.length });

    const ev = items.map((x) => ({ id: x.id, evidence: x.evidence.map((e) => ({ quote: e.quote, ids: [e.start_word_id, e.end_word_id], r: verifyQuote(words, e.start_word_id, e.end_word_id, e.quote) })) }));
    c.check("8.4", "у каждой сцены ≥ 1 цитата с id слов, проходящая verifyQuote", items.every((x) => x.evidence.length >= 1) && ev.every((x) => x.evidence.every((e) => e.r.ok)), ev);
    const timeRows = items.map((x) => ({
      id: x.id, edited: x.edited, source: x.source, frames: x.frames,
      frame_start_expected: usToFrame(x.edited.start_us, fps), source_start_expected: editedToSource(tl, x.edited.start_us),
    }));
    c.check("8.5", "edited/source/frames согласованы: frames.start = usToFrame(edited.start), editedToSource(edited.start) = source.start",
      timeRows.every((r) => r.frames.start === r.frame_start_expected && r.source.start_us === r.source_start_expected), timeRows);
    c.check("8.6", "есть решение skip с причиной (или обоснование, что графика нужна везде)", p0.doc.skipped.length > 0 && p0.doc.skipped.every((s) => s.reason.trim().length > 3), p0.doc.skipped);
    const faces = items.map((x) => ({ id: x.id, mode: x.composition_mode, zone: x.zone, plan_ratio: x.face_overlap.ratio, override: x.face_overlap.override_reason, recomputed: overlapOf(ftg, x) }));
    const overFace = faces.filter((f) => OVER_AUTHOR.has(f.mode) && f.plan_ratio > p0.face_overlap_max && !f.override);
    c.check("8.7", "нет overlay/callout/pip поверх лица без override_reason (доля лица > planning.faceOverlapMax)", overFace.length === 0, { over_face: overFace, max: p0.face_overlap_max, all: faces });
    const overFace2 = faces.filter((f) => OVER_AUTHOR.has(f.mode) && f.recomputed.face > p0.face_overlap_max && !f.override);
    c.check("8.7b", "пересчёт по рамке лица анализа видеоряда: то же самое", overFace2.length === 0, overFace2);
    const active = items.filter((x) => x.status !== "rejected");
    const cover = active.reduce((a, x) => a + x.edited.end_us - x.edited.start_us, 0) / tl.duration_us;
    const density = p0.doc.issues.filter((i) => i.code === "density");
    c.check("8.8", "покрытие графикой ≤ 40 % ролика (выдача агента, без подгонки)", cover <= 0.4,
      { coverage: Math.round(cover * 1000) / 10, density_issue: density, agent_retried: (agent as { retried?: number } | undefined)?.retried, issues: p0.doc.issues });
    // число из речи: сцена, чьи слова (основание или ключевые слова) пересекают диапазон числа разметки
    const idx = new Map(words.map((w, i) => [w.id, i]));
    const span = (a: string, b: string) => [idx.get(a)!, idx.get(b)!] as const;
    const numScenes = sem.numbers.map((n) => {
      const [a, b] = span(n.start_word_id, n.end_word_id);
      const hit = items.filter((x) => x.evidence.some((e) => { const [s, t] = span(e.start_word_id, e.end_word_id); return s <= b && a <= t; })
        || x.key_terms.some((k) => { const i = idx.get(k.word_id)!; return a <= i && i <= b; }));
      return { value: n.value, quote: n.quote, scenes: hit.map((x) => x.id) };
    });
    c.check("8.9", "есть сцена с числом из речи (если в ролике есть числа)", sem.numbers.length === 0 || numScenes.some((n) => n.scenes.length > 0), { numbers: numScenes });
    const lowContrast = style.contrast.filter((k) => k.ratio < k.min);
    c.check("8.10", "StyleBible проекта проходит контраст (нет blocking-проблем стиля)", lowContrast.length === 0 && style.issues.every((i) => i.severity !== "blocking"),
      { contrast: style.contrast, issues: style.issues, author: style.current.author ?? null });

    // [H→агент] ключевое слово звучит внутри сцены — по таймкодам слов (word_map), не по полю плана
    const kw = items.map((x) => ({
      id: x.id, edited: [s1(x.edited.start_us), s1(x.edited.end_us)],
      terms: x.key_terms.map((k) => {
        const m = edl.word_map[k.word_id];
        const at = m && m.state !== "removed" ? m.edited_start_us : NaN;
        return { text: k.text, word: words[idx.get(k.word_id)!]?.text, at_s: s1(at), inside: at >= x.edited.start_us && at < x.edited.end_us, plan_at_s: s1(k.edited_at_us) };
      }),
    }));
    c.check("8.11", "[H→агент] ключевые слова звучат внутри диапазона сцены (по таймкодам слов транскрипта)", kw.every((x) => x.terms.length > 0 && x.terms.every((t) => t.inside)), kw);

    // выгрузка для просмотра: сцены, текст внутри диапазона, оценки агента
    const textIn = (r: { start_us: number; end_us: number }) => words.filter((w) => {
      const m = edl.word_map[w.id];
      return m && m.state !== "removed" && m.edited_start_us >= r.start_us && m.edited_start_us < r.end_us;
    }).map((w) => w.text).join(" ");
    const review = [
      `План ${planId} r${p0.current_revision} (агент), EDL r${edl.current_revision}, ролик после монтажа ${s1(tl.duration_us)} с; покрытие ${Math.round(cover * 1000) / 10} %`, "",
      ...items.map((x) => [
        `${x.id} [${s1(x.edited.start_us)}–${s1(x.edited.end_us)} с после монтажа; исходник ${s1(x.source.start_us)}–${s1(x.source.end_us)} с] ${x.visual_type} / ${x.composition_mode} / ${x.zone}`,
        `  назначение: ${x.purpose}`, `  метафора: ${x.metaphor}`,
        `  ключевые слова: ${x.key_terms.map((k) => `«${k.text}» @${s1(k.edited_at_us)} с`).join(", ")}`,
        `  основание: ${x.evidence.map((e) => `«${e.quote}»`).join(" | ")}`,
        `  звучит в диапазоне: «${textIn(x.edited)}»`,
        `  полезность ${x.usefulness}/5, трудоёмкость ${x.effort}/5, нагрузка ${x.visual_load}/5, лицо ${x.face_overlap.ratio}`, "",
      ].join("\n")),
      "ПРОПУСКИ", ...p0.doc.skipped.map((s) => `- ${s.reason} (якоря ${s.anchor_ids.join(", ")})`), "",
      "ПРОБЛЕМЫ", ...p0.doc.issues.map((i) => `- ${i.severity} ${i.code} ${i.item_id ?? ""}: ${i.message}`),
    ].join("\n");
    writeEvidence("plan", "review.txt", review, EVIDENCE3);
    mkdirSync(EXAMPLES3, { recursive: true });
    copyFileSync(join(EVIDENCE3, "plan/review.txt"), join(EXAMPLES3, "plan-review.txt"));

    // раскладка сцен на кадре (draw-plan) и фрагменты превью rough cut вокруг каждой сцены — человеку
    const prDir = join(ACC_ROOT, `workspace/projects/${projectId}/plan/${planId}/r${p0.current_revision}`);
    const planJson = join(prDir, readdirSync(prDir).find((f) => /plan.*\.json$/.test(f))!);
    const fdir = join(ACC_ROOT, `workspace/projects/${projectId}/analysis/footage/${p0.doc.inputs.footage_id}`);
    const layoutOut = join(EVIDENCE3, "plan/acceptance");
    const drawn = execFileSync(process.execPath, [join(APP, "scripts/draw-plan.mjs"), planJson, fdir, layoutOut, String(items.length), "--video", state().video.path],
      { cwd: APP, encoding: "utf8", timeout: 600_000 }).trim().split("\n").filter(Boolean);
    mkdirSync(join(EXAMPLES3, "layout"), { recursive: true });
    for (const f of drawn) copyFileSync(f, join(EXAMPLES3, "layout", basename(f)));
    const preview = join(ACC_ROOT, `workspace/projects/${projectId}/preview/${edl.id}/r${edl.current_revision}/preview.mp4`);
    const clips: { id: string; clip: string; from_s: number; scene_in_clip: [number, number] }[] = [];
    if (existsSync(preview)) {
      mkdirSync(join(EXAMPLES3, "scenes"), { recursive: true });
      for (const x of items) {
        const from = Math.max(0, x.edited.start_us / 1e6 - 3);
        const len = Math.min(30, x.edited.end_us / 1e6 + 3 - from);
        const a = x.edited.start_us / 1e6 - from;
        const b = Math.min(len, x.edited.end_us / 1e6 - from);
        const label = esc(`${x.id} ${x.composition_mode}/${x.zone}: ${x.key_terms.map((k) => k.text).join(" · ")}`.slice(0, 90));
        const clip = join(EXAMPLES3, "scenes", `${x.id}-${s1(x.edited.start_us)}s.mp4`);
        execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-y", "-ss", from.toFixed(3), "-t", len.toFixed(3), "-protocol_whitelist", "file", "-i", `file:${preview}`,
          "-vf", `drawtext=fontfile=${FONT}:text='СЦЕНА ${label}':x=10:y=10:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.6:boxborderw=6:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})',`
            + `drawtext=fontfile=${FONT}:text='вне сцены':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=6:enable='not(between(t,${a.toFixed(2)},${b.toFixed(2)}))'`,
          "-c:v", "libx264", "-crf", "23", "-c:a", "aac", "-b:a", "128k", `file:${clip}`]);
        clips.push({ id: x.id, clip: basename(clip), from_s: Math.round(from * 100) / 100, scene_in_clip: [Math.round(a * 100) / 100, Math.round(b * 100) / 100] });
      }
    }
    writeEvidence("plan", "scene-clips.json", clips, EVIDENCE3);
    c.note("8.H", "раскладка сцен на кадре и фрагменты превью ≤ 30 с с подписью «СЦЕНА» на время сцены — человеку (ключевое слово в интервале, полезно/лишнее, лицо/руки)",
      { layout: drawn.map((f) => basename(f)), clips });
    await shot(page, "plan", "01-agent-plan", EVIDENCE3);

    // --- правки через UI ---
    let plan = p0;
    const refresh = async () => (plan = await getJson<PlanDto>(page.request, `/api/plans/${planId}`));
    const waitRev = async (rev: number) => {
      await expect.poll(async () => (await refresh()).current_revision, { timeout: 30_000 }).toBeGreaterThan(rev);
    };
    const select = async (id: string) => {
      await page.getByTestId(`scene-row-${id}`).locator(".scene-row-btn").click();
      await expect(page.getByTestId("inspector")).toHaveAttribute("aria-label", `Сцена ${id}`);
    };
    const inspector = page.getByTestId("inspector");
    const actions: { op: string; id: string; detail?: unknown }[] = [];

    // 1) сменить режим одной сцены: overlay ↔ callout (та же зона — перекрытие лица не меняется)
    const modTarget = items.find((x) => x.composition_mode === "overlay" || x.composition_mode === "callout") ?? items[0]!;
    const newMode = modTarget.composition_mode === "overlay" ? "callout" : modTarget.composition_mode === "callout" ? "overlay" : "fullscreen";
    await select(modTarget.id);
    let rev = plan.current_revision;
    await inspector.getByRole("button", { name: "Изменить" }).click();
    await inspector.getByLabel("Режим").selectOption(newMode);
    await inspector.getByRole("button", { name: "Сохранить" }).click();
    await waitRev(rev);
    const modded = plan.doc.items.find((x) => x.id === modTarget.id)!;
    c.check("8.12", "режим сцены изменён через UI (новая ревизия плана)", modded.composition_mode === newMode, { id: modTarget.id, from: modTarget.composition_mode, to: modded.composition_mode, revision: plan.current_revision });
    actions.push({ op: "modify composition_mode", id: modTarget.id, detail: `${modTarget.composition_mode} → ${newMode}` });

    // 2) отклонить одну: наименее полезную из прочих
    const rejTarget = [...items].filter((x) => x.id !== modTarget.id).sort((a, b) => a.usefulness - b.usefulness || b.visual_load - a.visual_load)[0];
    if (rejTarget) {
      await select(rejTarget.id);
      rev = plan.current_revision;
      await inspector.getByRole("button", { name: "Отклонить" }).click();
      await waitRev(rev);
      actions.push({ op: "reject", id: rejTarget.id, detail: `полезность ${rejTarget.usefulness}` });
    }
    c.check("8.13", "одна сцена отклонена через UI", Boolean(rejTarget) && plan.doc.items.find((x) => x.id === rejTarget!.id)?.status === "rejected", rejTarget?.id ?? "в плане одна сцена");

    // 3) своя сцена по выделенным словам: окно оставленных слов вдали от сцен, зона без лица
    const kept = words.map((w) => ({ w, m: edl.word_map[w.id] })).filter((x): x is { w: typeof x.w; m: { state: "kept" | "clipped"; edited_start_us: number; edited_end_us: number } } =>
      Boolean(x.m) && x.m!.state === "kept");
    const busyRanges = plan.doc.items.filter((x) => x.status !== "rejected").map((x) => x.edited);
    const free = (a: number, b: number) => busyRanges.every((r) => b + 2_000_000 <= r.start_us || r.end_us + 2_000_000 <= a);
    let pick: { i: number; j: number } | undefined;
    for (let i = Math.floor(kept.length * 0.15); i < kept.length - 10 && !pick; i++) {
      for (let j = i + 4; j < Math.min(kept.length, i + 14); j++) {
        const a = kept[i]!.m.edited_start_us;
        const b = kept[j]!.m.edited_end_us;
        if (b - a >= 2_500_000 && b - a <= 5_000_000 && free(a, b)) {
          pick = { i, j };
          break;
        }
      }
    }
    expect(pick, "нет участка оставленных слов вдали от сцен агента").toBeTruthy();
    const sw = kept[pick!.i]!;
    const ew = kept[pick!.j]!;
    const srcMid = (sw.w.start_us + ew.w.end_us) / 2;
    const sh = ftg.shots.find((s) => s.source_start_us <= srcMid && srcMid < s.source_end_us) ?? ftg.shots[0]!;
    const zone = (["left_third", "right_third", "top_band", "lower_third"] as Zone[])
      .map((z) => ({ z, face: sh.face.union ? inter(ZONE_RECTS[z], sh.face.union) : 0, free: sh.free_zones.find((f) => f.zone === z)?.free_ratio ?? 0 }))
      .sort((a, b) => a.face - b.face || b.free - a.free)[0]!.z;
    await page.locator(`.video-right .word[data-word-id="${sw.w.id}"]`).click();
    await page.locator(`.video-right .word[data-word-id="${ew.w.id}"]`).click({ modifiers: ["Shift"] });
    await page.getByRole("button", { name: /Добавить сцену/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Режим").selectOption("overlay");
    await dialog.getByLabel("Зона").selectOption(zone);
    await dialog.getByLabel("Назначение").fill("ключевая мысль фрагмента крупно рядом с автором");
    rev = plan.current_revision;
    await dialog.getByRole("button", { name: "Добавить" }).click();
    await waitRev(rev);
    const mine = plan.doc.items.find((x) => x.origin === "user");
    c.check("8.14", "своя сцена по выделенным словам добавлена (время и кадры посчитал код)", Boolean(mine) && mine!.start_word_id === sw.w.id && mine!.end_word_id === ew.w.id
      && mine!.frames.start === usToFrame(mine!.edited.start_us, fps) && mine!.source.start_us === editedToSource(tl, mine!.edited.start_us), mine);
    actions.push({ op: "add", id: mine?.id ?? "?", detail: { words: [sw.w.id, ew.w.id], zone, text: kept.slice(pick!.i, pick!.j + 1).map((k) => k.w.text).join(" ") } });

    // 4) решить остальные: blocking — честно разрешить (запись в actions), proposed — принять
    for (let guard = 0; guard < 40; guard++) {
      await refresh();
      const blocking = plan.doc.issues.filter((i) => i.severity === "blocking");
      const proposed = plan.doc.items.filter((x) => x.status === "proposed" || x.status === "stale");
      if (blocking.length === 0 && proposed.length === 0) break;
      rev = plan.current_revision;
      const b = blocking[0];
      if (b && b.item_id) {
        // сцена с blocking (лицо, пересечение, ключевое слово вне сцены) — отклонить
        await select(b.item_id);
        await inspector.getByRole("button", { name: "Отклонить" }).click();
        actions.push({ op: "reject (blocking)", id: b.item_id, detail: `${b.code}: ${b.message}` });
      } else if (b) {
        // density и прочие на весь план — отклонить наименее полезную сцену агента
        const victim = plan.doc.items.filter((x) => x.status !== "rejected" && x.origin === "agent" && x.id !== modTarget.id).sort((a, z) => a.usefulness - z.usefulness)[0]!;
        await select(victim.id);
        await inspector.getByRole("button", { name: "Отклонить" }).click();
        actions.push({ op: "reject (plan blocking)", id: victim.id, detail: `${b.code}: ${b.message}` });
      } else {
        const x = proposed[0]!;
        await select(x.id);
        await inspector.getByRole("button", { name: "Принять" }).click();
        actions.push({ op: "accept", id: x.id });
      }
      await waitRev(rev);
    }
    writeEvidence("plan", "ui-actions.json", actions, EVIDENCE3);
    c.note("8.15", "решения по сценам через UI (в т. ч. вынужденные из-за blocking)", actions, "info");
    await shot(page, "plan", "02-decided", EVIDENCE3);

    // 5) StyleBible: правка интенсивности → B зависит от стиля → план переносится на новый стиль
    await page.getByRole("tab", { name: "Стиль", exact: true }).click();
    await expect(page.getByTestId("style-bible")).toBeVisible();
    const intensity = page.getByLabel("Интенсивность");
    const before = await intensity.inputValue();
    await intensity.selectOption(before === "calm" ? "energetic" : "calm");
    await page.getByRole("button", { name: "Сохранить стиль" }).click();
    await expect.poll(async () => (await getJson<ProjectStyleDto>(page.request, `/api/projects/${projectId}/style`)).current.revision, { timeout: 30_000 })
      .toBeGreaterThan(style.current.revision);
    const style2 = await getJson<ProjectStyleDto>(page.request, `/api/projects/${projectId}/style`);
    writeEvidence("plan", "style-user.json", style2, EVIDENCE3);
    c.check("8.16", "StyleBible поправлен пользователем, контраст проходит", style2.contrast.every((k) => k.ratio >= k.min) && style2.issues.every((i) => i.severity !== "blocking"),
      { from: before, base: style2.current.base, contrast: style2.contrast });
    await shot(page, "plan", "03-style-edited", EVIDENCE3);
    await expect.poll(async () => (await refresh()).inputs_fresh.style, { timeout: 5 * 60_000 }).toBe(true);
    c.check("8.17", "план перенесён на новый стиль (inputs.style = текущая ревизия)", plan.doc.inputs.style.revision === style2.current.revision, plan.doc.inputs.style);

    // 6) Approval B
    await page.getByRole("tab", { name: "План", exact: true }).click();
    const approve = page.getByRole("button", { name: "Утвердить визуальный план (B)" });
    await expect(approve).toBeEnabled({ timeout: 30_000 });
    await approve.click();
    await expect(page.getByTestId("approval-B")).toContainText("утверждено");
    await refresh();
    const final = plan.doc.items;
    const activeF = final.filter((x) => x.status === "accepted");
    const coverF = activeF.reduce((a, x) => a + x.edited.end_us - x.edited.start_us, 0) / tl.duration_us;
    writeEvidence("plan", `plan-r${plan.current_revision}-approved.json`, plan, EVIDENCE3);
    const appr = db((d) => d.prepare("SELECT * FROM approvals WHERE project_id = ? ORDER BY decided_at").all(projectId)) as { kind: string; status: string; subject_ref: string }[];
    writeEvidence("approval-b", "approvals.json", appr, EVIDENCE3);
    c.check("8.18", "Approval B valid на текущую ревизию плана", appr.some((a) => a.kind === "B" && a.status === "valid" && a.subject_ref === `plan:${planId}@r${plan.current_revision}`),
      { revision: plan.current_revision, accepted: activeF.map((x) => x.id), coverage: Math.round(coverF * 1000) / 10 });
    await shot(page, "approval-b", "01-approved-B", EVIDENCE3);
    // раскладка утверждённого плана — человеку
    const apDir = join(ACC_ROOT, `workspace/projects/${projectId}/plan/${planId}/r${plan.current_revision}`);
    const apJson = join(apDir, readdirSync(apDir).find((f) => /plan.*\.json$/.test(f))!);
    const drawn2 = execFileSync(process.execPath, [join(APP, "scripts/draw-plan.mjs"), apJson, fdir, join(EVIDENCE3, "approval-b/layout"), String(activeF.length), "--video", state().video.path],
      { cwd: APP, encoding: "utf8", timeout: 600_000 }).trim().split("\n").filter(Boolean);
    mkdirSync(join(EXAMPLES3, "layout-approved"), { recursive: true });
    for (const f of drawn2) copyFileSync(f, join(EXAMPLES3, "layout-approved", basename(f)));
    writeEvidence("approval-b", "summary.json", { plan_id: planId, revision: plan.current_revision, accepted: activeF.map((x) => ({ id: x.id, origin: x.origin, mode: x.composition_mode, zone: x.zone, edited: x.edited })),
      coverage_pct: Math.round(coverF * 1000) / 10, layout: drawn2.map((f) => basename(f)) }, EVIDENCE3);
    execFileSync("cp", [join(EVIDENCE3, "plan/checks.json"), runFile("plan-checks.json")]);
  });
}
