// Task 34 Step 4: «Предложить монтаж» с агентом (реальный claude) → [A] у каждой вырезки причина,
// интервал, уверенность, объяснение; агентские — с проверенной цитатой (`verifyQuote`) → принять
// уверенные, одну отклонить, одну принятую «Восстановить» → [A] таймлайн = построенному без неё →
// остальные решить → «Собрать превью» → [A] длительность превью = timeline.duration_us ± 1 кадр →
// `timing-audit.mjs` (10 слов: обратное отображение без потерь, |audioOffset| ≤ 1 кадр) →
// [H→агент] 3 стыка: щелчки (скачок отсчёта / RMS вокруг стыка) и обрезанные слова (`mapWords`
// → clipped у границ) → «Утвердить (A)».
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { type EdlDto, type Job, type TranscriptDto, acceptedCuts, buildTimeline, verifyQuote } from "@ms/contracts";
import {
  ACC_ROOT, APP, Checks, EVIDENCE, agentRuns, db, ffprobe, getJson, jobCost, jobEvents, runFile, saveState, shot, state, timing, waitJob, writeEvidence,
} from "./helpers.js";

/** Примеры для человека (rulings 2026-10-24): фрагменты ≤ 30 с, только добавлять. */
export const EXAMPLES = "/Volumes/External SSD/Youtube/FinalVideo/MyProtocol/MotionStudio-примеры/task34-phase2";

const canon = (x: unknown): string => JSON.stringify(x, (_k, v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : v);

/** Аудио превью вокруг стыка (моно 48 кГц s16): макс. скачок соседних отсчётов и RMS по 5 мс. */
function junctionStats(preview: string, atUs: number): { max_jump: number; rms_peak_ratio: number; median_jump: number } {
  const from = Math.max(0, atUs - 100_000);
  const buf = execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-ss", String(from / 1e6), "-t", "0.2", "-protocol_whitelist", "file", "-i", `file:${preview}`,
    "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "-"], { maxBuffer: 16 << 20 });
  const s = Array.from({ length: buf.length / 2 }, (_, i) => buf.readInt16LE(i * 2));
  const jumps = s.slice(1).map((x, i) => Math.abs(x - s[i]!));
  const sorted = [...jumps].sort((a, b) => a - b);
  const win = 240;
  const rms: number[] = [];
  for (let i = 0; i + win <= s.length; i += win) rms.push(Math.sqrt(s.slice(i, i + win).reduce((a, x) => a + x * x, 0) / win));
  const mid = Math.floor(rms.length / 2);
  const around = rms.slice(Math.max(0, mid - 1), mid + 2);
  const base = [...rms].sort((a, b) => a - b)[Math.floor(rms.length / 2)] || 1;
  return { max_jump: Math.max(...jumps), median_jump: sorted[Math.floor(sorted.length / 2)]!, rms_peak_ratio: Math.round((Math.max(...around) / base) * 100) / 100 };
}

export default function roughcut(): void {
  test("Step 4: черновой монтаж с агентом, превью, аудит времени, Approval A", async ({ page }) => {
    const c = new Checks("roughcut");
    const st = state();
    const projectId = st.projectId!;
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("tab", { name: "Черновой монтаж" }).click();
    await page.getByLabel("С агентом-монтажёром (LLM)").check();
    const t0 = Date.now();
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/roughcut\/propose$/.test(r.url())),
      page.getByRole("button", { name: "Предложить монтаж" }).click(),
    ]);
    const proposeJob = ((await resp.json()) as { job: Job }).job;
    const pj = await waitJob(page.request, proposeJob.id, 45 * 60_000);
    const proposeCost = (pj.output_refs as { agent?: { cost_usd?: number } } | null)?.agent?.cost_usd ?? jobCost(pj.id);
    timing("roughcut.propose", { wall_ms: Date.now() - t0, cost_usd: proposeCost });
    c.check("4.1", "предложение монтажа с агентом завершено", pj.status === "completed", { status: pj.status, error: pj.error, output: pj.output_refs });
    const runs = agentRuns(pj.id);
    const agent = (pj.output_refs as { agent?: { status: string; calls: number; cost_usd: number } } | null)?.agent;
    c.check("4.2", "агент вызван (реальный claude): output_refs.agent completed, calls > 0", agent?.status === "completed" && agent.calls > 0, agent);
    // находка F1: прогоны агентов Phase 2–3 не пишутся в agent_runs (модель, токены, стоимость)
    c.check("4.2b", "прогоны агента записаны в agent_runs", runs.length > 0, { agent_runs: runs, output_agent: agent });
    const events = jobEvents(pj.id);
    writeEvidence("roughcut", "propose-job.json", { job: pj, agent_runs: runs, events });
    const rejected = (events as { kind: string; data_json: string | null }[]).filter((e) => e.kind === "agent_cut_rejected").map((e) => JSON.parse(e.data_json ?? "{}"));

    const v = await getJson<{ edl: { id: string }; transcript: { id: string } }>(page.request, `/api/projects/${projectId}/video`);
    const edlId = v.edl.id;
    saveState({ edlId });
    let edl = await getJson<EdlDto>(page.request, `/api/edls/${edlId}`);
    const tr = await getJson<TranscriptDto>(page.request, `/api/transcripts/${v.transcript.id}`);
    writeEvidence("roughcut", "edl-proposed.json", edl.doc);
    const ds = edl.doc.decisions;
    const byReason = ds.reduce<Record<string, number>>((a, d) => ({ ...a, [`${d.origin}:${d.reason}`]: (a[`${d.origin}:${d.reason}`] ?? 0) + 1 }), {});
    c.check("4.3", "есть предложения вырезок (детекторы и агент)", ds.length > 0 && ds.some((d) => d.origin === "agent"), byReason);
    const bad = ds.filter((d) => !d.reason || !(d.source_start_us < d.source_end_us) || !(d.confidence >= 0 && d.confidence <= 1) || d.explanation.trim().length < 3);
    c.check("4.4", "у каждой вырезки причина, интервал, уверенность, объяснение", bad.length === 0, bad);
    const agentChecks = ds.filter((d) => d.origin === "agent").map((d) => {
      const q = /«([^»]*)»\s*$/.exec(d.explanation)?.[1] ?? "";
      const r = d.start_word_id && d.end_word_id ? verifyQuote(tr.doc.words, d.start_word_id, d.end_word_id, q) : { ok: false, code: "no_words" };
      return { id: d.id, reason: d.reason, quote: q, ok: r.ok, r };
    });
    c.check("4.5", "агентские вырезки — с цитатой, проходящей verifyQuote по словам", agentChecks.length > 0 && agentChecks.every((x) => x.ok), agentChecks);
    c.note("4.5b", "отклонённые кодом предложения агента (не приняты с «примерным» временем)", rejected, "info");
    await shot(page, "roughcut", "01-proposed");

    // принять уверенные (≥ 0,8) одной кнопкой; одну из оставшихся — отклонить
    const proposedRows = page.locator('.cut-row[data-status="proposed"]');
    const acceptConfident = page.getByRole("button", { name: "Принять все ≥ 0,8" });
    if (await acceptConfident.isEnabled()) {
      await acceptConfident.click();
      await expect.poll(async () => (await getJson<EdlDto>(page.request, `/api/edls/${edlId}`)).current_revision).toBeGreaterThan(edl.current_revision);
    }
    edl = await getJson<EdlDto>(page.request, `/api/edls/${edlId}`);
    const toReject = edl.doc.decisions.find((d) => d.status === "proposed");
    if (toReject) {
      const rev = edl.current_revision;
      await page.getByTestId(`cut-${toReject.id}`).locator("button[data-action='reject']").click();
      await expect(page.getByTestId(`cut-${toReject.id}`)).toHaveAttribute("data-status", "rejected");
      await expect.poll(async () => (await getJson<EdlDto>(page.request, `/api/edls/${edlId}`)).current_revision).toBeGreaterThan(rev);
    }
    c.check("4.6", "одна вырезка отклонена", Boolean(toReject), toReject ?? "нет предложенных после «Принять все ≥ 0,8»");

    // одну принятую «Восстановить»: таймлайн = построенному без неё (до её принятия)
    edl = await getJson<EdlDto>(page.request, `/api/edls/${edlId}`);
    const restoreTarget = edl.doc.decisions.find((d) => d.status === "accepted" && d.origin === "agent") ?? edl.doc.decisions.find((d) => d.status === "accepted")!;
    const fps = edl.doc.timeline_fps;
    const srcDur = edl.timeline.source_duration_us;
    const without = buildTimeline(srcDur, acceptedCuts({ decisions: edl.doc.decisions.filter((d) => d.id !== restoreTarget.id) }), fps);
    const withIt = edl.timeline;
    const rev0 = edl.current_revision;
    await page.getByTestId(`cut-${restoreTarget.id}`).locator("button[data-action='restore']").click();
    await expect(page.getByTestId(`cut-${restoreTarget.id}`)).toHaveAttribute("data-status", "rejected");
    await expect.poll(async () => (await getJson<EdlDto>(page.request, `/api/edls/${edlId}`)).current_revision).toBeGreaterThan(rev0);
    edl = await getJson<EdlDto>(page.request, `/api/edls/${edlId}`);
    c.check("4.7", "«Восстановить» → таймлайн байт-в-байт как без этой вырезки", canon(edl.timeline) === canon(without),
      { restored: restoreTarget.id, with_ms: withIt.duration_us / 1e3, now_ms: edl.timeline.duration_us / 1e3, expected_ms: without.duration_us / 1e3 });

    // остальные предложенные: агентские и детекторные ≥ 0,6 — принять, прочие — отклонить
    for (;;) {
      edl = await getJson<EdlDto>(page.request, `/api/edls/${edlId}`);
      const next = edl.doc.decisions.find((d) => d.status === "proposed");
      if (!next) break;
      const action = next.confidence >= 0.6 ? "accept" : "reject";
      await page.getByTestId(`cut-${next.id}`).locator(`button[data-action='${action}']`).click();
      await expect.poll(async () => (await getJson<EdlDto>(page.request, `/api/edls/${edlId}`)).current_revision, { timeout: 30_000 }).toBeGreaterThan(edl.current_revision);
    }
    await expect(proposedRows).toHaveCount(0);
    edl = await getJson<EdlDto>(page.request, `/api/edls/${edlId}`);
    writeEvidence("roughcut", "edl-final.json", { revision: edl.current_revision, doc: edl.doc, timeline: edl.timeline });
    const acc = edl.doc.decisions.filter((d) => d.status === "accepted");
    c.note("4.8", "итог решений", { accepted: acc.length, rejected: edl.doc.decisions.filter((d) => d.status === "rejected").length, source_s: srcDur / 1e6, edited_s: edl.timeline.duration_us / 1e6 }, "info");
    await shot(page, "roughcut", "02-decided");

    // превью
    const t1 = Date.now();
    const [pr] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/revisions\/\d+\/preview$/.test(r.url())),
      page.getByRole("button", { name: "Собрать превью" }).click(),
    ]);
    const pjob = await waitJob(page.request, ((await pr.json()) as { job: Job }).job.id, 60 * 60_000);
    timing("roughcut.preview", { wall_ms: Date.now() - t1 });
    c.check("4.9", "превью собрано", pjob.status === "completed", { status: pjob.status, error: pjob.error });
    writeEvidence("roughcut", "preview-job.json", { job: pjob, events: jobEvents(pjob.id) });
    const preview = join(ACC_ROOT, `workspace/projects/${projectId}/preview/${edlId}/r${edl.current_revision}/preview.mp4`);
    const pp = ffprobe(preview, ["-count_packets"]);
    writeEvidence("roughcut", "preview.ffprobe.json", pp);
    const frameUs = Math.ceil((1e6 * fps.den) / fps.num);
    const vs = pp.streams.find((s) => s.codec_type === "video")!;
    const as = pp.streams.find((s) => s.codec_type === "audio");
    const vDur = Number(vs.duration) * 1e6;
    const aDur = as ? Number(as.duration) * 1e6 : NaN;
    c.check("4.10", "длительность превью (видео и звук) = timeline.duration_us ± 1 кадр", Math.abs(vDur - edl.timeline.duration_us) <= frameUs && Math.abs(aDur - edl.timeline.duration_us) <= frameUs,
      { video_us: vDur, audio_us: aDur, timeline_us: edl.timeline.duration_us, frame_us: frameUs });
    await page.getByRole("radio", { name: "После монтажа" }).click();
    await expect(page.locator(".proxy-player video")).toHaveAttribute("src", /preview\.mp4/);
    await expect(page.locator(".proxy-player video")).toHaveJSProperty("readyState", 4, { timeout: 60_000 });
    await shot(page, "roughcut", "03-preview");

    // аудит времени (скрипт)
    let audit: { ok: boolean };
    try {
      audit = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", join(APP, "scripts/timing-audit.mjs"), projectId, join(EVIDENCE, "roughcut")],
        { cwd: APP, env: { ...process.env, MS_DATA_DIR: ACC_ROOT }, encoding: "utf8", timeout: 600_000 }).trim().split("\n").at(-1)!) as { ok: boolean };
    } catch (e) {
      audit = { ok: false, ...(JSON.parse(String((e as { stdout?: string }).stdout ?? "{}").trim().split("\n").at(-1) || "{}") as object) };
    }
    c.check("4.11", "timing-audit: 10 слов — обратное отображение без потерь, |audioOffset| ≤ 1 кадр", audit.ok, audit);

    // [H→агент] 3 стыка: щелчки и обрезанные слова; фрагменты ±3 с — человеку
    const clips = edl.timeline.clips;
    const joins = clips.slice(1).map((cl) => ({ edited_us: cl.edited_start_us, source_from_us: clips[cl.idx - 1]!.source_end_us, source_to_us: cl.source_start_us }));
    const pick = [0.25, 0.5, 0.75].map((q) => joins[Math.floor(q * joins.length)]!).filter(Boolean);
    const words = tr.doc.words;
    mkdirSync(EXAMPLES, { recursive: true });
    const junctions = pick.map((j, k) => {
      const near = words.filter((w) => Math.abs(w.end_us - j.source_from_us) < 400_000 || Math.abs(w.start_us - j.source_to_us) < 400_000);
      const clipped = near.filter((w) => edl.word_map[w.id]?.state === "clipped");
      const stats = junctionStats(preview, j.edited_us);
      const clip = join(EXAMPLES, `junction-${k + 1}-${(j.edited_us / 1e6).toFixed(2)}s.mp4`);
      execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-y", "-ss", String(Math.max(0, j.edited_us / 1e6 - 3)), "-t", "6", "-protocol_whitelist", "file", "-i", `file:${preview}`,
        "-vf", "scale=-2:480", "-c:v", "libx264", "-crf", "23", "-c:a", "aac", "-b:a", "128k", `file:${clip}`]);
      return { ...j, near_words: near.map((w) => ({ id: w.id, text: w.text, state: edl.word_map[w.id]?.state })), clipped: clipped.map((w) => w.id), stats, clip };
    });
    writeEvidence("roughcut", "junctions.json", junctions);
    c.note("4.H", "3 стыка: нет щелчков и обрезанных слов — оценка агента по сигналу (скачок отсчёта, всплеск RMS) и word_map; прослушать — человеку", junctions);
    copyFileSync(join(EVIDENCE, "roughcut/timing-audit.md"), runFile("timing-audit.md"));

    // Approval A
    const approve = page.getByRole("button", { name: "Утвердить черновой монтаж (A)" });
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page.getByTestId("approval-A")).toContainText("утверждено");
    await shot(page, "roughcut", "04-approved-A");
    const appr = db((d) => d.prepare("SELECT * FROM approvals WHERE project_id = ? ORDER BY decided_at").all(projectId));
    writeEvidence("roughcut", "approvals.json", appr);
    c.check("4.12", "Approval A valid на текущую ревизию EDL", (appr as { kind: string; status: string; subject_ref: string }[]).some((a) => a.kind === "A" && a.status === "valid" && a.subject_ref === `edl:${edlId}@r${edl.current_revision}`), appr);
    writeFileSync(runFile("roughcut-done.json"), JSON.stringify({ edlId, revision: edl.current_revision }));
  });
}
