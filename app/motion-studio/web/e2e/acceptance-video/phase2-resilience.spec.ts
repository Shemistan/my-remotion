// Task 34 Step 6: устойчивость на копиях-отрезках сырого ролика (оригинал только читается):
// (4) импорт вне importRoots → понятная ошибка; (2) повторный POST импорта с тем же
// Idempotency-Key → тот же job.id; (1) `kill -9` сервера во время ASR → после старта группа
// воркера мертва, задача pending → completed; (3) MS_DATA_DIR переименован во время построения
// прокси → баннер, 503, на исходном пути ничего; вернули → задача доведена.
// `stress` (5): весь IMG_0685.MOV (66,6 мин) — импорт клоном, прокси, ASR со splits; долго,
// запускается отдельно (MS_ACC_ONLY=stress), время и стоимость — в отчёт.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Job, MediaDto, TranscriptDto } from "@ms/contracts";
import {
  ACC_ROOT, ACC_SRC, Checks, ORIGINAL, ORIGINAL_SHA256, alive, db, ffprobe, getJson, importViaUi, job, jobEvents, killServer, newVideoProject, post, runFile,
  saveState, sha256File, shot, sleep, startServer, state, timing, waitHealthy, waitJob, writeEvidence,
} from "./helpers.js";

/** Копия-отрезок оригинала (`-c copy`, матрица поворота сохраняется) в ACC_SRC; есть — не трогается. */
function cutCopy(startS: number, lenS: number): string {
  mkdirSync(ACC_SRC, { recursive: true });
  const out = join(ACC_SRC, `resilience-IMG_0685-${startS}-${startS + lenS}.mov`);
  if (!existsSync(out)) {
    execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-nostdin", "-ss", String(startS), "-t", String(lenS), "-protocol_whitelist", "file",
      "-i", `file:${ORIGINAL}`, "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-n", `file:${out}`]);
  }
  return out;
}

async function storageIs(want: "online" | "storage_offline", timeoutMs = 90_000): Promise<{ storage: string }> {
  const until = Date.now() + timeoutMs;
  let h = await waitHealthy();
  while (h.storage !== want && Date.now() < until) {
    await sleep(1000);
    h = await waitHealthy();
  }
  return h;
}

export default function resilience(): void {
  test("п. 4 и 2: импорт вне importRoots — понятная ошибка; повтор POST с тем же Idempotency-Key — тот же job", async ({ page }) => {
    const c = new Checks("resilience/import");
    const projectId = await newVideoProject(page, `Приёмка видео — устойчивость ${new Date().toISOString().slice(0, 16)}`);
    saveState({ resilienceProjectId: projectId });
    // файл вне корней: копия-отрезок в tmp репозитория (домашний каталог, не $HOME/Movies и не SSD)
    const outside = runFile("outside-roots.mov");
    if (!existsSync(outside)) copyFileSync(cutCopy(1000, 20), outside);
    await page.getByLabel("Путь к файлу на этом Mac").fill(outside);
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/media\/import$/.test(r.url())),
      page.getByRole("button", { name: "Импортировать" }).click(),
    ]);
    const body = (await resp.json()) as { error?: { code: string; message: string; details?: { reason?: string } } };
    await expect(page.locator(".media-import .error")).toContainText("вне разрешённых каталогов импорта");
    await shot(page, "resilience/import", "01-outside-roots");
    c.check("6.4", "импорт вне importRoots → 400 media_invalid outside_roots, понятный текст без путей хранилища", resp.status() === 400 && JSON.stringify(body).includes("outside_roots") && !JSON.stringify(body).includes(ACC_ROOT),
      { status: resp.status(), body });

    // идемпотентность импорта (API, как шлёт UI)
    const src = cutCopy(1000, 90);
    const key = `acc-video-import-${Date.now()}`;
    const r1 = await post(page.request, `/api/projects/${projectId}/media/import`, { path: src }, key);
    const r2 = await post(page.request, `/api/projects/${projectId}/media/import`, { path: src }, key);
    const j1 = ((await r1.json()) as { job: Job }).job;
    const j2 = ((await r2.json()) as { job: Job }).job;
    c.check("6.2", "повторный POST с тем же Idempotency-Key → тот же job.id (202, затем 200)", r1.status() === 202 && r2.status() === 200 && j1.id === j2.id, { first: [r1.status(), j1.id], second: [r2.status(), j2.id] });
    const done = await waitJob(page.request, j1.id, 30 * 60_000);
    const r3 = await post(page.request, `/api/projects/${projectId}/media/import`, { path: src }, key);
    const j3 = ((await r3.json()) as { job: Job }).job;
    const r4 = await post(page.request, `/api/projects/${projectId}/media/import`, { path: src });
    c.check("6.2b", "после завершения: тот же ключ → та же задача; новый ключ → 409 media_exists", r3.status() === 200 && j3.id === j1.id && r4.status() === 409 && (await r4.text()).includes("media_exists"),
      { done: done.status, replay: [r3.status(), j3.id], fresh: r4.status() });
    writeEvidence("resilience/import", "idempotency.json", { key, first: j1, replay_status: [r2.status(), r3.status()], fresh_status: r4.status(), done });
  });

  test("п. 1: kill -9 сервера во время ASR → группа воркера мертва, задача pending → completed", async ({ page }) => {
    const c = new Checks("resilience/asr-kill");
    const projectId = state().resilienceProjectId as string;
    const v = await getJson<{ media: MediaDto }>(page.request, `/api/projects/${projectId}/video`);
    const r = await post(page.request, `/api/media/${v.media.asset.id}/transcribe`, { language: "ru" });
    const asrJob = ((await r.json()) as { job: Job }).job;
    // ждём живой процесс воркера в реестре
    let proc: { pid: number; pgid: number; cmd: string; attempt: number } | undefined;
    const until = Date.now() + 10 * 60_000;
    while (!proc && Date.now() < until) {
      proc = db((d) => d.prepare("SELECT pid, pgid, cmd, attempt FROM job_processes WHERE job_id = ? AND ended_at IS NULL AND cmd LIKE '%asr%' ORDER BY started_at DESC").get(asrJob.id)) as typeof proc;
      if (!proc) await sleep(500);
    }
    c.check("6.1a", "воркер ASR запущен (реестр процессов)", Boolean(proc), proc);
    await sleep(1500);
    const groupAlive = () => {
      try {
        process.kill(-proc!.pgid, 0);
        return true;
      } catch {
        return false;
      }
    };
    const before = { job: (await job(page.request, asrJob.id)).status, worker_alive: alive(proc!.pid) };
    await killServer("SIGKILL");
    const afterKill = { worker_alive: alive(proc!.pid), group_alive: groupAlive() };
    const t0 = Date.now();
    await startServer();
    const reaped = { worker_alive: alive(proc!.pid), group_alive: groupAlive() };
    const j0 = await job(page.request, asrJob.id);
    c.check("6.1b", "после старта группа воркера прежней попытки мертва", !reaped.worker_alive && !reaped.group_alive, { before, afterKill, reaped });
    const j = await waitJob(page.request, asrJob.id, 60 * 60_000);
    timing("resilience.asr_kill", { wall_ms: Date.now() - t0 });
    const ev = jobEvents(asrJob.id);
    c.check("6.1c", "задача после рестарта (pending, попытка 2) доходит до completed", j.status === "completed" && j.attempt >= 2, { right_after_start: { status: j0.status, attempt: j0.attempt }, final: { status: j.status, attempt: j.attempt } });
    const t = await getJson<{ transcript: { id: string } | null }>(page.request, `/api/projects/${projectId}/video`);
    const tr = t.transcript ? await getJson<TranscriptDto>(page.request, `/api/transcripts/${t.transcript.id}`) : null;
    c.check("6.1d", "транскрипт опубликован одной ревизией r1", tr?.doc.revision === 1 && (tr?.doc.words.length ?? 0) > 50, { revision: tr?.doc.revision, words: tr?.doc.words.length });
    writeEvidence("resilience/asr-kill", "job.json", { job: j, events: ev, process: proc, before, afterKill, reaped,
      processes: db((d) => d.prepare("SELECT attempt, pid, pgid, cmd, started_at, ended_at, exit_code FROM job_processes WHERE job_id = ?").all(asrJob.id)) });
  });

  test("п. 3: хранилище переименовано во время прокси → баннер, 503, на исходном пути ничего; вернули → импорт доведён", async ({ page }) => {
    const c = new Checks("resilience/storage-offline");
    const projectId = await newVideoProject(page, `Приёмка видео — хранилище ${new Date().toISOString().slice(0, 16)}`);
    saveState({ storageProjectId: projectId });
    const src = cutCopy(2000, 300);
    const imp = await importViaUi(page, src);
    // ждём этап proxy
    const until = Date.now() + 10 * 60_000;
    let j = await job(page.request, imp.id);
    while (j.stage !== "proxy" && j.status !== "completed" && Date.now() < until) {
      await sleep(500);
      j = await job(page.request, imp.id);
    }
    c.check("6.3a", "импорт дошёл до построения прокси", j.stage === "proxy", { status: j.status, stage: j.stage });
    await sleep(3000);
    const moved = `${ACC_ROOT}.renamed-${Date.now()}`;
    renameSync(ACC_ROOT, moved);
    try {
      const h = await storageIs("storage_offline");
      c.check("6.3b", "сервер в режиме storage_offline", h.storage === "storage_offline", h);
      await page.reload();
      await expect(page.getByText("Хранилище недоступно").first()).toBeVisible({ timeout: 30_000 });
      await shot(page, "resilience/storage-offline", "01-banner");
      const get = await page.request.get(`/api/projects/${projectId}/video`);
      const p = await post(page.request, `/api/projects/${projectId}/media/import`, { path: src });
      c.check("6.3c", "API: GET и POST → 503 storage_offline", get.status() === 503 && p.status() === 503, { get: get.status(), post: p.status(), body: await p.text() });
      await sleep(12_000);
      c.check("6.3d", "на исходном пути ничего не создано", !existsSync(ACC_ROOT), existsSync(ACC_ROOT) ? execFileSync("ls", ["-la", ACC_ROOT], { encoding: "utf8" }) : "нет");
    } finally {
      if (!existsSync(ACC_ROOT)) renameSync(moved, ACC_ROOT);
    }
    const h = await storageIs("online");
    c.check("6.3e", "каталог возвращён → online", h.storage === "online", h);
    const done = await waitJob(page.request, imp.id, 60 * 60_000);
    const ev = jobEvents(imp.id);
    c.check("6.3f", "импорт доведён после возврата (completed)", done.status === "completed", { status: done.status, attempt: done.attempt, error: done.error });
    await page.reload();
    await expect(page.getByText("Хранилище недоступно")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("media-info")).toContainText("кадр/с", { timeout: 60_000 });
    await shot(page, "resilience/storage-offline", "02-after-return");
    writeEvidence("resilience/storage-offline", "job.json", { job: done, events: ev });
  });
}

export function stress(): void {
  test("п. 5 (стресс): весь IMG_0685.MOV — импорт клоном, прокси, ASR со splits", async ({ page }) => {
    const c = new Checks("resilience/stress");
    const projectId = await newVideoProject(page, `Приёмка видео — стресс 66 мин ${new Date().toISOString().slice(0, 16)}`);
    saveState({ stressProjectId: projectId });
    const t0 = Date.now();
    const imp = await importViaUi(page, ORIGINAL);
    const done = await waitJob(page.request, imp.id, 4 * 60 * 60_000);
    const importMs = Date.now() - t0;
    timing("stress.import", { wall_ms: importMs, note: `${done.created_at} → ${done.finished_at}` });
    c.check("6.5a", "импорт 66-минутного исходника завершён", done.status === "completed", { status: done.status, error: done.error, wall_min: importMs / 60_000 });
    const v = await getJson<{ media: MediaDto }>(page.request, `/api/projects/${projectId}/video`);
    const m = v.media;
    c.check("6.5b", "импорт клоном APFS (тот же том)", m.asset.import.cloned === true && m.asset.sha256 === ORIGINAL_SHA256, m.asset.import);
    const proxyRel = db((d) => d.prepare("SELECT rel_path FROM media_derivatives WHERE media_id = ? AND kind = 'proxy'").pluck().get(m.asset.id)) as string;
    const pp = ffprobe(join(ACC_ROOT, proxyRel));
    const pv = pp.streams.find((s) => s.codec_type === "video")!;
    const durS = m.asset.probe.duration_us / 1e6;
    c.check("6.5c", "прокси CFR, длительность ± 1 кадр", pv.r_frame_rate === pv.avg_frame_rate && Math.abs(Number(pv.duration) - durS) <= 1 / 30 + 1e-6, { r: pv.r_frame_rate, avg: pv.avg_frame_rate, proxy_s: pv.duration, source_s: durS });
    writeEvidence("resilience/stress", "import.json", { job: done, events: jobEvents(done.id), media: m, proxy: pp });
    await shot(page, "resilience/stress", "01-imported");

    const t1 = Date.now();
    const r = await post(page.request, `/api/media/${m.asset.id}/transcribe`, { language: "ru" });
    const asr = await waitJob(page.request, ((await r.json()) as { job: Job }).job.id, 4 * 60 * 60_000);
    const asrMs = Date.now() - t1;
    timing("stress.asr", { wall_ms: asrMs, cost_usd: 0 });
    c.check("6.5d", "ASR 66 мин завершён", asr.status === "completed", { status: asr.status, error: asr.error, wall_min: asrMs / 60_000 });
    const ev = jobEvents(asr.id) as { kind: string; message: string; data_json: string | null }[];
    const procs = db((d) => d.prepare("SELECT attempt, pid, cmd, started_at, ended_at, exit_code FROM job_processes WHERE job_id = ?").all(asr.id)) as { cmd: string }[];
    const splitsArg = procs.map((p) => /--splits\s+(\S+)/.exec(p.cmd)?.[1]).find(Boolean);
    const splits = splitsArg ? splitsArg.split(",").map(Number) : [];
    c.check("6.5e", "ASR со splits (> 300 с → разрезы по тишине, куски ≤ 290 с)", splits.length >= Math.floor(durS / 300) && [0, ...splits, durS].every((x, i, a) => i === 0 || x - a[i - 1]! <= 290.001),
      { splits, n: splits.length });
    const t = await getJson<{ transcript: { id: string } }>(page.request, `/api/projects/${projectId}/video`);
    const tr = await getJson<TranscriptDto>(page.request, `/api/transcripts/${t.transcript.id}`);
    const w = tr.doc.words;
    const gaps = w.slice(1).map((x, i) => (x.start_us - w[i]!.end_us) / 1e6);
    const chunkCover = [0, ...splits].map((a, i, arr) => {
      const b = arr[i + 1] ?? durS;
      return { from_s: a, to_s: b, words: w.filter((x) => x.start_us / 1e6 >= a && x.start_us / 1e6 < b).length };
    });
    c.check("6.5f", "слова покрывают длительность: есть в каждом куске, первые — в начале, последние — у конца", chunkCover.every((k) => k.words > 0) && w[0]!.start_us < 120e6 && w.at(-1)!.end_us > (durS - 120) * 1e6,
      { words: w.length, first_s: w[0]!.start_us / 1e6, last_s: w.at(-1)!.end_us / 1e6, duration_s: durS, max_gap_s: Math.max(...gaps), chunks: chunkCover });
    writeEvidence("resilience/stress", "asr.json", { job: asr, events: ev, processes: procs, words: w.length, chunks: chunkCover, asr: tr.doc.asr });
    if (asrMs > 60 * 60_000) c.note("6.5H", "ASR дольше 60 мин — [H]-пометка, не блокирует приёмку", { wall_min: asrMs / 60_000 });
    const orig = await sha256File(ORIGINAL);
    c.check("6.5g", "оригинал не изменён после стресса (sha256)", orig === ORIGINAL_SHA256, orig);
    saveState({ original: { ...state().original, sha256_after: orig } });
  });
}
