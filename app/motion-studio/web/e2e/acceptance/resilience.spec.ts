// Устойчивость (`09` §5) на настоящем сервере с реальными claude и рендером:
// п. 4 сломанная сцена не блокирует очередь; п. 3 Idempotency-Key; п. 10 конфликтующие
// операции над сценой идут по очереди; п. 1–2 kill -9 во время рендера генерации; п. 8 kill -9
// при живом процессе, игнорирующем SIGTERM; п. 9 устаревшая попытка → fenced_out; п. 5
// хранилище переименовано; п. 7 второй экземпляр. п. 8 и 9 — тестовые хуки сервера
// (MS_TEST_HOOKS=1, без маршрутов). Evidence — docs/evidence/phase-1/resilience/.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import type { Job, JobEventDto } from "@ms/contracts";
import {
  ACC_ROOT, APP, BASE, Checks, EVIDENCE, alive, collect, db, exportViaUi, getJson, job, killServer, portBusy, scene, shot, sleep,
  startServer, state, versionDir, waitHealthy, waitJob, writeEvidence,
} from "./helpers.js";

const ORIGIN = { Origin: BASE };
const ORPHAN = join(APP, "server/test/fixtures/bin/orphan-render.sh");
const QUEUE_PROMPT = "Объясни, как работает очередь сообщений между сервисом заказов и складом";
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

function sceneHashes(sceneId: string): Record<string, string> {
  const ids = db((d) => d.prepare("SELECT id FROM scene_versions WHERE scene_id = ? ORDER BY number").pluck().all(sceneId) as string[]);
  const out: Record<string, string> = {};
  for (const id of ids) {
    const dir = versionDir(id);
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { files: { path: string }[] };
    out[`${id}/manifest.json`] = sha(join(dir, "manifest.json"));
    for (const f of m.files) out[`${id}/${f.path}`] = sha(join(dir, f.path));
  }
  return out;
}

const events = async (page: Page, id: string) => (await getJson<{ events: JobEventDto[] }>(page.request, `/api/jobs/${id}`)).events;
const kinds = (es: JobEventDto[]) => es.filter((e) => e.kind !== "progress").map((e) => `${e.kind}: ${e.message}`);
const dbJob = (id: string) => db((d) => d.prepare("SELECT status, attempt, interrupts, stage FROM jobs WHERE id = ?").get(id) as { status: string; attempt: number; interrupts: number; stage: string | null });

/** Наблюдение двух задач одной сцены: снимки статусов, пока обе не завершатся. */
async function watchPair(page: Page, a: string, b: string, timeoutMs = 40 * 60_000) {
  const seen: { t: number; a: string; b: string }[] = [];
  const until = Date.now() + timeoutMs;
  for (;;) {
    const [ja, jb] = [await job(page.request, a), await job(page.request, b)];
    seen.push({ t: Date.now(), a: ja.status, b: jb.status });
    const done = (s: string) => ["completed", "failed", "cancelled", "blocked"].includes(s);
    if (ja.status === "awaiting_input") await page.request.post(`/api/jobs/${a}/input`, { headers: ORIGIN, data: { skip: true } });
    if (jb.status === "awaiting_input") await page.request.post(`/api/jobs/${b}/input`, { headers: ORIGIN, data: { skip: true } });
    if (done(ja.status) && done(jb.status)) return { ja, jb, seen };
    if (Date.now() > until) throw new Error(`задачи ${a}, ${b} не завершились`);
    await sleep(2000);
  }
}

/** Итог «по очереди»: ни в один момент обе не running; вторая стартовала после конца первой. */
function serial(r: Awaited<ReturnType<typeof watchPair>>) {
  const both = r.seen.filter((s) => s.a === "running" && s.b === "running").length;
  const waited = r.seen.some((s) => s.a === "running" && s.b === "pending");
  const after = !!r.ja.finished_at && !!r.jb.started_at && r.jb.started_at >= r.ja.finished_at;
  return { ok: both === 0 && waited && after, both, waited, after, a: { status: r.ja.status, started: r.ja.started_at, finished: r.ja.finished_at }, b: { status: r.jb.status, started: r.jb.started_at, finished: r.jb.finished_at } };
}

/** «Экспорт» MP4 через UI без ожидания: id задачи из ответа POST. */
async function startExport(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Экспорт версии" });
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && /\/api\/versions\/[^/]+\/exports$/.test(r.url())),
    dialog.getByRole("button", { name: "Экспортировать" }).click(),
  ]);
  return ((await resp.json()) as { job: Job }).job.id;
}

const arm = (hook: unknown) => writeFileSync(join(state().hooksDir, "arm.json"), JSON.stringify(hook));

export default function resilience(): void {
  test.describe("устойчивость 09 §5", () => {
    test("п. 4: сломанная сцена — ошибка рендера с логами, превью нет; экспорт другой сцены выполняется", async ({ page }) => {
      test.setTimeout(20 * 60_000);
      const c = new Checks("resilience/broken-scene");
      const { fixtures } = state();
      await page.goto(`/scenes/${fixtures.hang.sceneId}`);
      const box = page.getByRole("alert").filter({ hasText: "Версия v1 не удалась" });
      await expect(box).toBeVisible();
      const log = (await page.getByTestId("failure-log").textContent()) ?? "";
      c.check("p4.error", "UI: ошибка этапа «рендер» с журналом (timeout, hang-scene)", (await box.textContent())!.includes("Ошибка на этапе «рендер»") && /timeout/.test(log) && /hang-scene/.test(log), log.slice(0, 400));
      c.check("p4.no-preview", "превью нет, «Экспорт» недоступен", (await page.locator("video").count()) === 0 && (await page.getByRole("button", { name: "Экспорт", exact: true }).isDisabled()), "");
      await shot(page, "resilience", "p4-render-failure");
      await page.goto(`/scenes/${fixtures.kit.sceneId}`);
      await expect(page.getByRole("heading", { name: "v1", level: 1 })).toBeVisible();
      const ex = await exportViaUi(page, "mp4");
      c.check("p4.queue", "следом экспорт MP4 kit-gallery выполнен", ex.probe.video.codec_name === "h264", { exportId: ex.exportId, probe: ex.probe });
      collect(fixtures.hang.versionIds[0]!, join(EVIDENCE, "resilience/broken-scene/hang-v1"));
    });

    test("п. 3 и п. 10: Idempotency-Key; две правки и правка с «Восстановить» идут по очереди", async ({ page }) => {
      test.setTimeout(90 * 60_000);
      const c = new Checks("resilience/queue");
      const st = state();
      const kitV = st.fixtures.kit.versionIds[0]!;
      // п. 3: экспорт — повтор POST с тем же ключом → та же задача
      const key = `acc-idem-export-${Date.now()}`;
      const body = { format: "mp4", crf: 18, scale: 1 };
      const r1 = await page.request.post(`/api/versions/${kitV}/exports`, { headers: { ...ORIGIN, "Idempotency-Key": key }, data: body });
      const r2 = await page.request.post(`/api/versions/${kitV}/exports`, { headers: { ...ORIGIN, "Idempotency-Key": key }, data: body });
      const [j1, j2] = [(await r1.json()) as { job: Job }, (await r2.json()) as { job: Job }];
      c.check("p3.export", "повтор POST экспорта с тем же Idempotency-Key → тот же job.id", r1.status() === 202 && r2.status() === 200 && j1.job.id === j2.job.id, { statuses: [r1.status(), r2.status()], ids: [j1.job.id, j2.job.id] });
      await waitJob(page, j1.job.id, 20 * 60_000);
      const rows = db((d) => d.prepare("SELECT COUNT(*) FROM exports WHERE job_id = ?").pluck().get(j1.job.id) as number);
      c.check("p3.export-once", "экспорт по ключу один", rows === 1, rows);

      // п. 3 + п. 10: правка в чате сцены Test 1 через API дважды с одним ключом, затем «Рендер» в UI
      const sceneId = st.test1!.sceneId;
      const text = "сделай анимацию на 10 % быстрее";
      const k2 = `acc-idem-chat-${Date.now()}`;
      const m1 = await page.request.post(`/api/scenes/${sceneId}/messages`, { headers: { ...ORIGIN, "Idempotency-Key": k2 }, data: { text } });
      const m2 = await page.request.post(`/api/scenes/${sceneId}/messages`, { headers: { ...ORIGIN, "Idempotency-Key": k2 }, data: { text } });
      const [b1, b2] = [(await m1.json()) as { job: Job; message: { id: string } }, (await m2.json()) as { job: Job; message: { id: string } }];
      const msgs = (await getJson<{ text: string; role: string }[]>(page.request, `/api/scenes/${sceneId}/messages`)).filter((m) => m.role === "user" && m.text === text);
      c.check("p3.chat", "повтор POST правки с тем же ключом → та же задача и одно сообщение", m1.status() === 202 && m2.status() === 200 && b1.job.id === b2.job.id && msgs.length === 1,
        { statuses: [m1.status(), m2.status()], jobs: [b1.job.id, b2.job.id], messages: msgs.length });
      const jobA = b1.job.id;
      await page.goto(`/scenes/${sceneId}`);
      await expect(page.getByRole("heading", { name: /^v\d+$/, level: 1 })).toBeVisible();
      await page.getByLabel("Тема").selectOption("tech-neon");
      const [rr] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/api/scenes/${sceneId}/render`)),
        page.getByRole("button", { name: "Рендер" }).click(),
      ]);
      const jobB = ((await rr.json()) as { job: Job }).job.id;
      await shot(page, "resilience", "p10-edit-and-render-queued");
      const pair1 = serial(await watchPair(page, jobA, jobB));
      c.check("p10.edits", "две правки одной сцены: вторая pending, пока первая running", pair1.ok, pair1);

      // правка в чате (UI) и сразу «Восстановить» v1 (UI)
      await page.goto(`/scenes/${sceneId}`);
      await page.getByRole("region", { name: "Чат" }).getByLabel("Сообщение").fill("сделай всё в бирюзовых тонах");
      const [cr] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/api/scenes/${sceneId}/messages`)),
        page.getByRole("button", { name: "Отправить" }).click(),
      ]);
      const jobC = ((await cr.json()) as { job: Job }).job.id;
      const v1 = st.test1!.versionId!;
      const [rs] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/api/scenes/${sceneId}/restore`)),
        page.getByRole("region", { name: "История версий" }).locator(`[data-version-id="${v1}"] button[data-action="restore"]`).click(),
      ]);
      const jobD = ((await rs.json()) as { job: Job }).job.id;
      await shot(page, "resilience", "p10-edit-and-restore-queued");
      const pair2 = serial(await watchPair(page, jobC, jobD));
      c.check("p10.restore", "правка и «Восстановить»: восстановление ждёт в очереди", pair2.ok, pair2);
      const d = await scene(page.request, sceneId);
      writeEvidence("resilience/queue", "scene-after.json", d);
      await page.goto(`/scenes/${sceneId}`);
      await shot(page, "resilience", "p10-history-after");
    });

    test("п. 1–2: kill -9 во время рендера генерации → задача продолжена, другая сцена не затронута", async ({ page }) => {
      test.setTimeout(90 * 60_000);
      const c = new Checks("resilience/kill-during-render");
      const st = state();
      const other = st.test2!.sceneId;
      const before = sceneHashes(other);
      await page.goto(`/projects/${st.projectId}`);
      await page.getByLabel("Что показать").fill(QUEUE_PROMPT);
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && /\/api\/projects\/[^/]+\/scenes$/.test(r.url())),
        page.getByRole("button", { name: "Сгенерировать" }).click(),
      ]);
      const created = (await resp.json()) as { scene: { id: string }; job: Job };
      const id = created.job.id;
      // ждём этап рендера (Engineer написал сцену, идёт renderVersion)
      const until = Date.now() + 40 * 60_000;
      for (;;) {
        const j = await job(page.request, id);
        if (j.status === "awaiting_input") await page.request.post(`/api/jobs/${id}/input`, { headers: ORIGIN, data: { skip: true } });
        if (j.status === "running" && j.stage === "render") break;
        expect(["pending", "running", "awaiting_input"], `задача ушла в ${j.status} до рендера: ${JSON.stringify(j.error)}`).toContain(j.status);
        if (Date.now() > until) throw new Error("этап render не наступил за 40 мин");
        await sleep(1000);
      }
      await sleep(3000);
      await shot(page, "resilience", "p1-before-kill");
      await killServer("SIGKILL");
      const dead = dbJob(id);
      c.check("p1.dead", "сервер убит во время рендера: задача в БД running", dead.status === "running" && dead.stage === "render", dead);
      await startServer();
      const afterBoot = dbJob(id);
      c.check("p1.requeued", "после старта: pending/running с прерыванием 1 (или failed interrupted)", ["pending", "running"].includes(afterBoot.status) ? afterBoot.interrupts === 1 : afterBoot.status === "failed", afterBoot);
      await page.goto(`/scenes/${created.scene.id}`);
      const j = await waitJob(page, id, 60 * 60_000);
      const es = kinds(await events(page, id));
      c.check("p1.events", "журнал: interrupted → requeued → новая попытка", es.some((e) => e.startsWith("interrupted:")) && es.some((e) => e.startsWith("requeued:")) && j.attempt >= 2, es.filter((e) => /interrupted|requeued|started|completed|failed/.test(e)));
      if (j.status === "completed") {
        c.check("p1.done", "задача доведена до completed", true, { status: j.status, attempt: j.attempt, interrupts: j.interrupts });
      } else {
        await page.reload();
        const retry = page.getByRole("button", { name: "Повторить" });
        c.check("p1.done", "задача failed(interrupted) с кнопкой «Повторить»", j.status === "failed" && j.error?.code === "interrupted" && (await retry.count()) > 0, j.error);
      }
      await shot(page, "resilience", "p1-after-restart");
      const after = sceneHashes(other);
      const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
      c.check("p2.other", "другая сцена (Test 2) не затронута: sha256 файлов версий те же", changed.length === 0, { files: Object.keys(before).length, changed });
      const d = await scene(page.request, created.scene.id);
      const v = [...d.versions].sort((a, b) => b.number - a.number)[0];
      if (v) collect(v.version_id, join(EVIDENCE, "resilience/kill-during-render/version"));
      writeEvidence("resilience/kill-during-render", "job.json", { job: j, events: es });
    });

    test("п. 8: kill -9 при живом процессе, игнорирующем SIGTERM → не pending, пока он жив; затем повтор", async ({ page }) => {
      test.setTimeout(30 * 60_000);
      const c = new Checks("resilience/orphan");
      const st = state();
      const pidFile = join(st.runDir, `orphan-${Date.now()}.pid`);
      arm({ hook: "orphan", cmd: ORPHAN, args: [pidFile] });
      await page.goto(`/scenes/${st.fixtures.kit.sceneId}`);
      await expect(page.getByRole("heading", { name: "v1", level: 1 })).toBeVisible();
      const id = await startExport(page);
      const t0 = Date.now();
      while (!existsSync(pidFile) && Date.now() - t0 < 60_000) await sleep(200);
      const grandchild = Number(readFileSync(pidFile, "utf8").trim());
      const detail = await getJson<{ processes: { pid: number; cmd: string; alive: boolean }[] }>(page.request, `/api/jobs/${id}`);
      c.check("p8.tracked", "процесс попытки в реестре (job_processes), жив", detail.processes.some((p) => p.cmd.includes("orphan-render.sh") && p.alive) && alive(grandchild), detail.processes);
      await killServer("SIGKILL");
      c.check("p8.alive-after-kill", "сервер убит, процесс-сирота жив, задача не pending", alive(grandchild) && dbJob(id).status === "running", { grandchild, job: dbJob(id) });
      await sleep(5000);
      c.check("p8.still", "через 5 с без сервера: процесс жив, задача всё ещё не pending", alive(grandchild) && dbJob(id).status !== "pending", dbJob(id));
      await startServer();
      c.check("p8.reaped", "после старта: процесс добит (SIGKILL после SIGTERM), задача снова в очереди", !alive(grandchild) && dbJob(id).interrupts === 1, { grandchild, job: dbJob(id) });
      const j = await waitJob(page, id, 20 * 60_000);
      const es = kinds(await events(page, id));
      c.check("p8.done", "новая попытка выполнила экспорт", j.status === "completed" && j.attempt === 2, { status: j.status, attempt: j.attempt, events: es });
      const log = readFileSync(st.serverLog, "utf8").split("\n").filter((l) => /прежних попыток|reap|stale|orphan/i.test(l)).slice(-10);
      writeEvidence("resilience/orphan", "job.json", { job: j, events: es, server_log: log });
    });

    test("п. 9: устаревшая попытка публикует после старта новой → fenced_out", async ({ page }) => {
      test.setTimeout(30 * 60_000);
      const c = new Checks("resilience/fencing");
      const st = state();
      arm({ hook: "stale-attempt" });
      await page.goto(`/scenes/${st.fixtures.kit.sceneId}`);
      await expect(page.getByRole("heading", { name: "v1", level: 1 })).toBeVisible();
      const id = await startExport(page);
      const j = await waitJob(page, id, 20 * 60_000);
      const marker = join(ACC_ROOT, "workspace/drafts", `${id}-a1`, ".quarantined");
      const t0 = Date.now();
      while (!existsSync(marker) && Date.now() - t0 < 60_000) await sleep(500);
      const reason = existsSync(marker) ? readFileSync(marker, "utf8") : "";
      const es = kinds(await events(page, id));
      const rows = db((d) => d.prepare("SELECT id FROM exports WHERE job_id = ?").pluck().all(id) as string[]);
      c.check("p9.fenced", "публикация попытки 1 отклонена fencing (fenced_out), draft в карантине", /fenced_out: попытка 1 задачи \S+ устарела \(текущая: 2\)/.test(reason), reason);
      c.check("p9.single", "экспорт опубликован один раз — попыткой 2; задача completed", j.status === "completed" && j.attempt === 2 && rows.length === 1, { status: j.status, attempt: j.attempt, exports: rows });
      c.check("p9.events", "журнал: test_hook и fenced_out", es.some((e) => e.startsWith("test_hook:")) && es.some((e) => e.startsWith("fenced_out:")), es);
      await page.getByRole("link", { name: "Задачи" }).click();
      await shot(page, "resilience", "p9-jobs");
      writeEvidence("resilience/fencing", "job.json", { job: j, events: es, quarantine: reason, exports: rows });
    });

    test("п. 5: хранилище переименовано → баннер, 503, на исходном пути ничего; вернули → работа продолжается", async ({ page }) => {
      test.setTimeout(20 * 60_000);
      const c = new Checks("resilience/storage-offline");
      const st = state();
      const kitV = st.fixtures.kit.versionIds[0]!;
      const jobsBefore = db((d) => d.prepare("SELECT COUNT(*) FROM jobs").pluck().get() as number);
      const moved = `${ACC_ROOT}.renamed-${Date.now()}`;
      await page.goto("/");
      renameSync(ACC_ROOT, moved);
      try {
        const until = Date.now() + 60_000;
        let health = await waitHealthy();
        while (health.storage !== "storage_offline" && Date.now() < until) { await sleep(1000); health = await waitHealthy(); }
        c.check("p5.offline", "сервер в режиме storage_offline", health.storage === "storage_offline", health);
        await page.reload();
        const banner = page.getByText("Хранилище недоступно").first();
        await expect(banner).toBeVisible({ timeout: 30_000 });
        await shot(page, "resilience", "p5-storage-offline");
        const list = await page.request.get("/api/projects");
        const post = await page.request.post(`/api/versions/${kitV}/exports`, { headers: { ...ORIGIN, "Idempotency-Key": `acc-offline-${Date.now()}` }, data: { format: "mp4" } });
        c.check("p5.503", "API: GET и POST → 503 storage_offline", list.status() === 503 && post.status() === 503, { get: list.status(), post: post.status(), body: await post.text() });
        await sleep(12_000);
        c.check("p5.nothing", "на исходном пути ничего не создано (каталог не появился)", !existsSync(ACC_ROOT), existsSync(ACC_ROOT) ? execFileSync("ls", ["-la", ACC_ROOT], { encoding: "utf8" }) : "нет");
      } finally {
        if (!existsSync(ACC_ROOT)) renameSync(moved, ACC_ROOT);
      }
      const until = Date.now() + 90_000;
      let health = await waitHealthy();
      while (health.storage !== "online" && Date.now() < until) { await sleep(1000); health = await waitHealthy(); }
      c.check("p5.online", "каталог возвращён → online", health.storage === "online", health);
      const jobsAfter = db((d) => d.prepare("SELECT COUNT(*) FROM jobs").pluck().get() as number);
      c.check("p5.no-jobs", "пока хранилище было недоступно, задач не появилось", jobsAfter === jobsBefore, { jobsBefore, jobsAfter });
      await page.goto(`/scenes/${st.fixtures.kit.sceneId}`);
      await expect(page.getByText("Хранилище недоступно")).toHaveCount(0, { timeout: 30_000 });
      const ex = await exportViaUi(page, "mp4");
      c.check("p5.continues", "после возврата экспорт выполняется", ex.probe.video.codec_name === "h264", ex.exportId);
    });

    test("п. 7: второй npm start при живом первом → owner_busy; после kill -9 первого стартует", async () => {
      test.setTimeout(10 * 60_000);
      const c = new Checks("resilience/second-instance");
      const env = { ...process.env, MS_DATA_DIR: ACC_ROOT };
      const npmStart = () => spawn(join(APP, "scripts/with-node.sh"), ["npm", "start"], { cwd: APP, env, stdio: ["ignore", "pipe", "pipe"] });
      const run = (p: ChildProcess) => new Promise<{ code: number | null; out: string }>((resolve) => {
        let out = "";
        p.stdout!.on("data", (d: Buffer) => (out += d.toString()));
        p.stderr!.on("data", (d: Buffer) => (out += d.toString()));
        p.once("exit", (code) => resolve({ code, out }));
      });
      const second = await run(npmStart());
      c.check("p7.busy", "второй npm start при живом первом выходит с owner_busy", second.code !== 0 && /owner_busy/.test(second.out), second.out.split("\n").filter(Boolean).slice(-4));
      await killServer("SIGKILL");
      const third = npmStart();
      const thirdDone = run(third);
      await waitHealthy(120_000);
      c.check("p7.free", "после kill -9 первого npm start поднимает сервер", true, "health ok");
      const pid = Number(execFileSync("lsof", ["-nP", "-iTCP:8790", "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim().split("\n")[0]);
      process.kill(pid, "SIGTERM");
      const r = await thirdDone;
      while (await portBusy()) await sleep(200);
      c.check("p7.stop", "npm start останавливается по SIGTERM", true, r.out.split("\n").filter(Boolean).slice(-3));
      await startServer();
    });
  });
}
