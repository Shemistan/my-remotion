// Приёмка сценарного MVP (S12, спека §13) через UI: реальный claude и рендер, хранилище
// `materialsPath("acceptance", "store")`, сервер 127.0.0.1:8790. Шаги по порядку:
// text → plan → edit → generate (рестарт сервера посреди пакета) → package-v1 → refine (чат → v2)
// → package (п.9–11) → vertical (9:16 двух сцен) → quality (разнообразие пакета, судья, кадры).
// Продолжение: есть tmp/acceptance-script/state.json + MS_ACC_ONLY=<шаги через запятую>. Проверки — checks.json (id §13),
// evidence — docs/evidence/script-mvp/acceptance/. Долго (≈ 2–4 ч) и платно (справочно).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ReadingSettings, type ScriptBatchDto, type ScriptPlanRevisionDoc, type ScriptSceneItem, type ScriptStateDto, type Technique, quoteOf, readingFrames, tokenizeScript, wordsBetween } from "@ms/contracts";
import type { MotionSpec, SceneDetailDto, VersionDto } from "@ms/contracts";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { alphaAtCorner, alphaCoverage, overlayFrames } from "@ms/render";
import { judgeRuntime, loadJudgePrompt, prepareJudgeInput, runJudge } from "../../../server/src/bench/judge.js";
import { REFERENCE } from "../../../server/src/bench/reference.js";
import { loadConfig, readConfigFile } from "../../../server/src/config.js";
import { quoteInFragment, valueMatches } from "../../../server/src/script/plan-validate.js";
import {
  ACC_ROOT, APP, BLOCKS_DIR, EVIDENCE, POLL_MS, RUN_DIR, STATE_FILE, type AccState, addCost, alive, batch, check, db, frame480, getJson, jobCost, log, norm,
  pkg, portBusy, probe, redact, saveState, scriptState, sleep, startServer, state, stopServer, terminal, timeStep, versionPath, waitJob, writeEvidence,
} from "./helpers.js";
import { materialsRoot } from "../../../core/src/storage/materials.js";

const PROJECT = "Go map — Swiss Table";
const FPS = { num: 30, den: 1 };
const PHRASE_256 = "Случайное совпадение по такому байту бывает с вероятностью один к двумстам пятидесяти шести";
const REFINE_TEXT = "сделай число крупнее и медленнее";
const GEN_TIMEOUT = 8 * 3600_000;
/** Через сколько после старта пакета сервер останавливается (SIGTERM), бриф S12 п.4. */
const RESTART_AFTER_MS = 5 * 60_000;

const only = process.env.MS_ACC_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
const step = (name: string) => (!only || only.includes(name) ? test : test.skip);
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();
const card = (page: Page, itemId: string): Locator => page.locator(`[data-testid="scene-card"][data-item="${itemId}"]`);
const tile = (page: Page, itemId: string): Locator => page.locator(`[data-testid="scene-tile"][data-item="${itemId}"]`);
const accepted = (doc: ScriptPlanRevisionDoc): ScriptSceneItem[] => doc.items.filter((x) => x.status === "accepted");
const sec = (frames: number) => frames / 30;

function readBlocks(): { title: string; text: string }[] {
  return [1, 2, 3].map((n) => {
    const [title, ...rest] = readFileSync(join(BLOCKS_DIR, `block-${n}.txt`), "utf8").split("\n");
    return { title: title!.trim(), text: rest.join("\n").trim() };
  });
}

async function openProject(page: Page): Promise<string> {
  const { projectId } = state();
  await page.goto(`/projects/${projectId!}`);
  await expect(page.getByRole("heading", { name: PROJECT, level: 1 })).toBeVisible();
  return projectId!;
}

/** Выделяет фразу в тексте плана, как мышью (тот же путь, что в e2e S8). */
async function selectPhrase(page: Page, phrase: string): Promise<void> {
  const block = page.locator(".script-text-panel p.script-block", { hasText: phrase.split(" ")[0]! });
  await block.evaluate((el, p) => {
    const text = el.textContent ?? "";
    const from = text.indexOf(p);
    if (from < 0) throw new Error(`нет фразы «${p}»`);
    const to = from + p.length;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let at = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const len = n.textContent?.length ?? 0;
      if (from >= at && from <= at + len) range.setStart(n, from - at);
      if (to >= at && to <= at + len) {
        range.setEnd(n, to - at);
        break;
      }
      at += len;
    }
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, phrase);
}

/** Полный скриншот в tmp и копия 960 px по ширине в evidence (UI для просмотра человеком [H]). */
async function uiShot(page: Page, name: string): Promise<void> {
  const full = join(RUN_DIR, "ui", `${name}.png`);
  mkdirSync(join(RUN_DIR, "ui"), { recursive: true });
  mkdirSync(join(EVIDENCE, "ui"), { recursive: true });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: full, fullPage: true });
  execFileSync("/usr/bin/sips", ["--resampleWidth", "960", full, "--out", join(EVIDENCE, "ui", `${name}.png`)], { stdio: "ignore" });
}

/** Ждёт конца всех сцен пакетов опросом раз в `POLL_MS`; `onTick` — между опросами (рестарт). */
async function waitBatches(page: Page, ids: string[], onTick?: (elapsed: number) => Promise<void>): Promise<ScriptBatchDto[]> {
  const t0 = Date.now();
  for (;;) {
    const bs = await Promise.all(ids.map((id) => batch(page.request, id)));
    const items = bs.flatMap((b) => b.items);
    const counts = items.reduce<Record<string, number>>((a, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }), {});
    log(`пакеты ${ids.join(",")}: ${JSON.stringify(counts)} (${Math.round((Date.now() - t0) / 60_000)} мин)`);
    if (items.every((x) => terminal(x.job?.status ?? "completed") && x.status !== "pending" && x.status !== "running")) return bs;
    if (Date.now() - t0 > GEN_TIMEOUT) throw new Error(`пакеты не закончились за ${GEN_TIMEOUT} мс`);
    const until = Date.now() + POLL_MS;
    while (Date.now() < until) {
      await sleep(Math.min(15_000, until - Date.now()));
      await onTick?.(Date.now() - t0);
    }
  }
}

/** «Повторить генерацию» на карточке сцены (вкладка «Сцены») → id пакета повтора. */
async function retryViaUi(page: Page, itemId: string, aspect: "16:9" | "9:16"): Promise<string> {
  await page.reload();
  await tab(page, "Сцены");
  if (aspect === "9:16") await page.getByRole("radio", { name: "9:16" }).check();
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/script/generate")),
    tile(page, itemId).getByRole("button", { name: "Повторить генерацию" }).click(),
  ]);
  expect(resp.status(), await resp.text()).toBeLessThan(300);
  return ((await resp.json()) as ScriptBatchDto).id;
}

/** «Собрать папку <aspect>» на вкладке «Экспорт» → задача script.package → id пакета. */
async function buildPackage(page: Page, aspect: "16:9" | "9:16"): Promise<{ id: string; ms: number }> {
  await openProject(page);
  await tab(page, "Экспорт");
  if (aspect === "9:16") await page.locator('input[name="export-aspect"][value="9:16"]').check();
  const t0 = Date.now();
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/script/package")),
    page.getByRole("button", { name: `Собрать папку ${aspect}` }).click(),
  ]);
  expect(resp.status(), await resp.text()).toBeLessThan(300);
  const jobId = ((await resp.json()) as { job: { id: string } }).job.id;
  const j = await waitJob(page.request, jobId, 90 * 60_000, 15_000);
  expect(j.status, JSON.stringify(j.error)).toBe("completed");
  const id = (j.output_refs as { package_id: string }).package_id;
  await expect(page.locator(`[data-testid="package-card"][data-package="${id}"]`)).toBeVisible({ timeout: 60_000 });
  return { id, ms: Date.now() - t0 };
}

interface PackageManifest {
  scenes: { n: number; item_id: string; version_id: string; frames: { total: number }; mp4: { file: string } | null; alpha: { file: string } | null }[];
}
const manifestOf = (dir: string) => JSON.parse(readFileSync(join(dir, "package-manifest.json"), "utf8")) as PackageManifest;

const BOM = String.fromCharCode(0xfeff);

/** CSV шпаргалки (UTF-8 BOM, «;», кавычки по RFC 4180) → строки полей. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  const s = text.startsWith(BOM) ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ";") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(f); f = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== "" || row.length > 0) { row.push(f); rows.push(row); }
  return rows;
}

// не serial: мягкий провал проверки §13 (expect.soft) не должен пропускать следующие шаги;
// после провала воркер перезапускается, beforeAll продолжает прогон по state.json
test.describe.configure({ mode: "default" });

test.beforeAll(async () => {
  test.setTimeout(15 * 60_000);
  if (!existsSync(materialsRoot())) throw new Error(`внешний SSD не подключён: нет ${materialsRoot()}`);
  if (!existsSync(join(APP, "web/dist/index.html"))) throw new Error("нет web/dist: сначала `make web-build`");
  // есть state.json — продолжение прогона (и после перезапуска воркера); новый прогон — без него
  const reuse = existsSync(STATE_FILE);
  if (reuse && alive(state().serverPid)) return;
  if (await portBusy()) throw new Error("порт 8790 занят чужим процессом");
  const tsx = (args: string[], env: NodeJS.ProcessEnv) => execFileSync(process.execPath, ["--import", "tsx", ...args], { cwd: APP, env, encoding: "utf8", timeout: 600_000 });
  const env = { ...process.env, MS_DATA_DIR: ACC_ROOT, MS_LOG_LEVEL: "warn" };
  if (!reuse) {
    const runDir = join(RUN_DIR, `run-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    mkdirSync(runDir, { recursive: true });
    // хранилище приёмки: нет маркера — `doctor --init` (готовое `--init` отвергает); `doctor` обязан пройти
    if (!existsSync(join(ACC_ROOT, ".motion-studio-store.json"))) tsx(["server/src/cli/doctor.ts", "--init"], env);
    let doctor: string;
    let ok = true;
    try {
      doctor = tsx(["server/src/cli/doctor.ts"], env);
    } catch (e) {
      ok = false;
      doctor = String((e as { stdout?: string }).stdout ?? (e as Error).message);
    }
    writeEvidence("doctor.txt", redact(doctor));
    // судья и проверочные ffmpeg — в своём tmp-хранилище: хранилище приёмки при живом сервере пишет только сервер
    const scratchRoot = join(runDir, "scratch-store");
    tsx(["server/src/cli/doctor.ts", "--init"], { ...env, MS_DATA_DIR: scratchRoot, MS_ALLOW_SYSTEM_DISK: "1" });
    writeFileSync(STATE_FILE, JSON.stringify({ runDir, serverPid: 0, serverLog: join(runDir, "server.log"), scratchRoot, times: {}, costs: {} } satisfies AccState, null, 2) + "\n");
    check("0.doctor", "doctor на хранилище приёмки — код 0", ok, doctor.split("\n").filter((l) => /fail|warn|degraded/i.test(l)).slice(0, 10));
  }
  await startServer();
});

test.afterAll(async () => {
  if (!existsSync(STATE_FILE)) return;
  if (process.env.MS_ACC_KEEP_SERVER === "1") return;
  if (alive(state().serverPid)) await stopServer("SIGTERM");
});

step("text")("п.1: проект, три блока, ревизия 1, слова = tokenizeScript", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const t0 = Date.now();
  const blocks = readBlocks();
  const tok = tokenizeScript(blocks);
  const want = blocks.map((_, i) => tok.words.filter((w) => w.block_id === `b${i + 1}`).length);
  await page.goto("/");
  await page.getByLabel("Название проекта").fill(PROJECT);
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await expect(page.getByRole("heading", { name: PROJECT, level: 1 })).toBeVisible();
  const projectId = /\/projects\/([^/?#]+)/.exec(page.url())![1]!;
  saveState({ projectId });
  const textTab = page.getByTestId("text-tab");
  for (const [i, b] of blocks.entries()) {
    if (i > 0) await textTab.getByRole("button", { name: "Добавить блок" }).click();
    await textTab.getByLabel(`Заголовок блока ${i + 1} (необязательно)`).fill(b.title);
    await textTab.getByLabel(`Текст блока ${i + 1}`).fill(b.text);
  }
  const total = (await textTab.getByText(/^Всего: /).textContent())!;
  const perBlock = await textTab.locator(".script-block-editor .row span.small.muted").allTextContents();
  await textTab.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(textTab.getByText("Сохранено, ревизия 1")).toBeVisible();
  const st = await scriptState(page.request, projectId);
  const got = blocks.map((_, i) => st.script!.words.filter((w) => w.block_id === `b${i + 1}`).length);
  const uiWords = perBlock.map((s) => Number(/^(\d+)/.exec(s)?.[1] ?? -1));
  const sum = want.reduce((a, b) => a + b, 0);
  const titlesOk = st.script!.blocks.every((b, i) => b.title === blocks[i]!.title && b.text === blocks[i]!.text);
  check("13.1", "три блока одним проектом, ревизия 1, слова и время чтения = tokenizeScript",
    st.script!.revision === 1 && st.script!.blocks.length === 3 && titlesOk && JSON.stringify(got) === JSON.stringify(want) &&
      JSON.stringify(uiWords) === JSON.stringify(want) && total.includes(`${sum} слов`),
    { revision: st.script!.revision, words_api: got, words_tokenize: want, words_ui: uiWords, ui_blocks: perBlock, ui_total: total, brief_2026_10_24: [205, 281, 228] });
  await uiShot(page, "text");
  timeStep("text", t0);
});

step("plan")("п.2–4: «Построить план» агентом — время, цена, цитаты, разнообразие, числа", async ({ page }) => {
  test.setTimeout(40 * 60_000);
  const projectId = await openProject(page);
  const build = page.getByTestId("build-plan");
  await expect(build.getByRole("checkbox", { name: "С агентом (LLM)" })).toBeChecked();
  const t0 = Date.now();
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/script/plan")),
    build.getByRole("button", { name: "Построить план" }).click(),
  ]);
  const jobId = ((await resp.json()) as { job: { id: string } }).job.id;
  saveState({ planJobId: jobId });
  const j = await waitJob(page.request, jobId, 30 * 60_000, 5_000);
  const seconds = Math.round((Date.now() - t0) / 1000);
  expect(j.status, JSON.stringify(j.error)).toBe("completed");
  const cost = jobCost(jobId);
  addCost("plan", cost);
  timeStep("plan", t0);
  await expect(page.getByTestId("plan-tab")).toBeVisible({ timeout: 60_000 });
  const st = await scriptState(page.request, projectId);
  const doc = st.plan!.doc;
  writeEvidence("plan-r1.json", doc);
  const script = st.script!;
  const acc = accepted(doc);

  // п.2: время, цена, дословные цитаты, без пересечений, речь 3–20 с
  const idx = (id: string) => script.words.findIndex((w) => w.id === id);
  const badQuotes = doc.items.filter((x) => {
    const ws = wordsBetween(script, x.start_word_id, x.end_word_id);
    return ws.length === 0 || x.quote !== quoteOf(script, x.start_word_id, x.end_word_id) || new Set(ws.map((w) => w.block_id)).size !== 1;
  }).map((x) => x.id);
  const ranges = acc.map((x) => [idx(x.start_word_id), idx(x.end_word_id), x.id] as const).sort((a, b) => a[0] - b[0]);
  const overlaps = ranges.slice(1).filter((r, i) => r[0] <= ranges[i]![1]).map((r) => r[2]);
  const speech = acc.map((x) => ({ id: x.id, s: Number(sec(x.frames.speech).toFixed(1)) }));
  const outOfRange = speech.filter((x) => x.s < 3 || x.s > 20);
  check("13.2", "план ≤ 5 мин, ≤ $3; цитаты дословны; без пересечений; речь сцен 3–20 с",
    seconds <= 300 && cost <= 3 && badQuotes.length === 0 && overlaps.length === 0 && outOfRange.length === 0,
    { seconds, cost_usd: Number(cost.toFixed(3)), items: doc.items.length, accepted: acc.length, skipped: doc.skipped.length, bad_quotes: badQuotes, overlaps, speech_out_of_3_20: outOfRange, issues: doc.issues.map((x) => `${x.severity}:${x.code}`) });

  // п.3: разнообразие плана
  const repeats = acc.slice(1).filter((x, i) => x.technique === acc[i]!.technique).map((x) => x.id);
  const kinds = new Set(acc.map((x) => x.technique));
  const kinetic = acc.filter((x) => x.technique === "kinetic-quote").length / acc.length;
  check("13.3", "соседние сцены — разные приёмы; ≥ 5 приёмов; kinetic-quote ≤ 20 %",
    repeats.length === 0 && kinds.size >= 5 && kinetic <= 0.2,
    { adjacent_repeats: repeats, techniques: doc.diversity.techniques, distinct: kinds.size, kinetic_share: Number(kinetic.toFixed(2)), sequence: acc.map((x) => x.technique) });

  // п.4: числа плана — с цитатой из фрагмента, value сверяется с цитатой
  const numbers = acc.flatMap((x) => x.data.map((d) => {
    const frag = wordsBetween(script, x.start_word_id, x.end_word_id).map((w) => w.text);
    return { item: x.id, label: d.label, value: d.value, unit: d.unit ?? null, quote: d.quote, in_fragment: quoteInFragment(d.quote, frag), match: valueMatches(d.value, d.quote) ?? null };
  }));
  const bad = numbers.filter((n) => !n.quote || !n.in_fragment || n.match === false);
  const values = numbers.map((n) => n.value);
  const expected = { "1.24": values.includes(1.24), "2025": values.includes(2025), "8": values.includes(8), "1/256": values.some((v) => v === 256 || Math.abs(v - 1 / 256) < 1e-6), "6.5": values.includes(6.5) };
  check("13.4", "числа плана — с цитатами из фрагмента, value совпадает с цитатой",
    numbers.length > 0 && bad.length === 0,
    { count: numbers.length, bad, unverified: numbers.filter((n) => n.match === null).length, value_unverified_issues: doc.issues.filter((x) => x.code === "value_unverified").length, expected_found: expected, numbers });
  await uiShot(page, "plan-r1");
});

step("edit")("п.5: правки через UI — убрать, добавить по выделению, приём, скорость 2,3 → 2,5", async ({ page }) => {
  test.setTimeout(20 * 60_000);
  const t0 = Date.now();
  const projectId = await openProject(page);
  await tab(page, "План");
  const plan = page.getByTestId("plan-tab");
  let st = await scriptState(page.request, projectId);
  const script = st.script!;
  let rev = st.plan!.doc.revision;
  /** UI показывает текущую ревизию `rev` — следующая правка уйдёт с верным base_revision. */
  const uiAt = (r: number) => expect(plan.getByText(`Ревизия плана ${r}`, { exact: true })).toBeVisible({ timeout: 60_000 });
  // ревью S16a I3(д): ревизия — по состоянию сервера (≥ rev + 1), а не «ровно +1»: дозаполнение публикует свои
  const nextRev = async () => {
    const until = Date.now() + 60_000;
    for (;;) {
      st = await scriptState(page.request, projectId);
      if (st.plan!.doc.revision > rev) break;
      if (Date.now() > until) throw new Error(`ревизия плана не выросла с r${rev} за 60 с`);
      await sleep(1000);
    }
    rev = st.plan!.doc.revision;
    await uiAt(rev);
    return st.plan!.doc;
  };
  // ревью S16a I3(а): сцена после «добавить» и смены приёма ждёт дозаполнения Director — ждём, пока поле fill
  // не исчезнет (задача дозаполнения закончилась), затем ревизия и UI по факту; итог — сцена, задача, цена, время
  const waitFilled = async (itemId: string) => {
    const t1 = Date.now();
    const until = t1 + 5 * 60_000;
    for (;;) {
      st = await scriptState(page.request, projectId);
      const it = st.plan!.doc.items.find((x) => x.id === itemId);
      if (!it?.fill) break;
      if (it.fill === "failed" || Date.now() > until || (st.fill_job && ["failed", "cancelled", "blocked"].includes(st.fill_job.status))) {
        throw new Error(`сцена ${itemId} не дозаполнена: fill ${it.fill}, задача ${st.fill_job?.id ?? "—"} ${st.fill_job?.status ?? ""} ${JSON.stringify(st.fill_job?.error ?? null)}`);
      }
      await sleep(3000);
    }
    rev = st.plan!.doc.revision;
    await uiAt(rev);
    const item = st.plan!.doc.items.find((x) => x.id === itemId)!;
    expect(item.fill).toBeUndefined();
    const jobId = st.fill_job?.id ?? null;
    const cost = jobId ? jobCost(jobId) : 0;
    return { doc: st.plan!.doc, item, fill: { job: jobId, status: st.fill_job?.status ?? null, cost_usd: Number(cost.toFixed(3)), seconds: Math.round((Date.now() - t1) / 1000) }, cost };
  };
  const ops: Record<string, unknown> = {};

  // слова фразы «один к двумстам пятидесяти шести» и сцена, которая её уже покрывает
  const tok = tokenizeScript([{ title: "", text: PHRASE_256 }]).words.map((w) => w.text);
  const at = script.words.findIndex((_, i) => tok.every((t, k) => script.words[i + k]?.text === t));
  expect(at, "фраза про 1/256 есть в тексте").toBeGreaterThanOrEqual(0);
  const [p0, p1] = [script.words[at]!.id, script.words[at + tok.length - 1]!.id];
  const pos = (id: string) => script.words.findIndex((w) => w.id === id);
  let acc = accepted(st.plan!.doc);
  const covering = acc.find((x) => pos(x.start_word_id) <= at + tok.length - 1 && pos(x.end_word_id) >= at);
  // убрать: сцену, перекрывающую фразу (иначе выделение пересечётся), или среднюю сцену, чьи соседи
  // разных приёмов (иначе после удаления соседи дадут blocking adjacent_technique_repeat)
  const safe = acc.find((x, i) => i > 0 && i < acc.length - 1 && acc[i - 1]!.technique !== acc[i + 1]!.technique);
  const removed = covering ?? safe!;
  await card(page, removed.id).getByRole("button", { name: "Убрать", exact: true }).click();
  let doc = await nextRev();
  ops.remove = { item: removed.id, technique: removed.technique, quote: removed.quote, covered_phrase: covering !== undefined, status: doc.items.find((x) => x.id === removed.id)?.status };

  // добавить по выделению; приём — «Ключевое число», если не повторит соседа, иначе авто
  acc = accepted(doc);
  const before = acc.filter((x) => pos(x.end_word_id) < at).at(-1);
  const after = acc.find((x) => pos(x.start_word_id) > at);
  const heroOk = before?.technique !== "hero-number" && after?.technique !== "hero-number";
  await selectPhrase(page, PHRASE_256);
  const bar = page.getByTestId("selection-bar");
  await expect(bar).toContainText("один к двумстам пятидесяти шести");
  if (heroOk) await bar.getByLabel("Приём новой сцены").selectOption("hero-number");
  await bar.getByRole("button", { name: "Добавить сцену по выделенному" }).click();
  doc = await nextRev();
  const addedId = doc.items.find((x) => x.origin === "user" && x.start_word_id === p0 && x.end_word_id === p1)?.id;
  expect(addedId, "сцена по выделению добавлена").toBeDefined();
  const addFill = await waitFilled(addedId!);
  doc = addFill.doc;
  const added = addFill.item;
  ops.add = {
    item: added.id, technique: added.technique, quote: added.quote, frames: added.frames,
    idea: added.idea, purpose: added.purpose, pattern: added.pattern, data: added.data, key_terms: added.key_terms.map((k) => k.text), fill: addFill.fill,
  };

  // сменить приём у одной сцены: первая «Тезис словами» (или первая сцена) → приём, которого нет у соседей
  acc = accepted(doc);
  const ci = Math.max(0, acc.findIndex((x) => x.technique === "kinetic-quote" && x.id !== added.id));
  const target = acc[ci]!;
  const prefer: Technique[] = ["structure-build", "flow-graph", "process-steps", "data-token", "callout-diagram", "split-versus", "checklist", "timeline"];
  const technique = prefer.find((t) => t !== target.technique && t !== acc[ci - 1]?.technique && t !== acc[ci + 1]?.technique)!;
  await card(page, target.id).getByLabel("Приём").selectOption(technique);
  await nextRev();
  const techFill = await waitFilled(target.id);
  doc = techFill.doc;
  const retargeted = techFill.item;
  ops.technique = {
    item: target.id, from: target.technique, to: retargeted.technique, idea_before: target.idea,
    idea: retargeted.idea, purpose: retargeted.purpose, pattern: retargeted.pattern, data: retargeted.data, fill: techFill.fill,
  };
  addCost("edit.fill", addFill.cost + techFill.cost);

  // скорость 2,5 → 2,3 → 2,5: длительности всех принятых сцен пересчитаны без агента
  const framesFor = (d: ScriptPlanRevisionDoc, r: ReadingSettings) => accepted(d).every((x) => JSON.stringify(x.frames) === JSON.stringify(readingFrames(x.words, r, FPS)));
  const base = accepted(doc).map((x) => x.frames.total);
  const reading = plan.getByRole("form", { name: "Скорость чтения и запас" });
  await reading.getByLabel("Слов в секунду").fill("2,3");
  await reading.getByRole("button", { name: "Применить" }).click();
  doc = await nextRev();
  const slow = accepted(doc).map((x) => x.frames.total);
  const slowOk = doc.reading.wps === 2.3 && framesFor(doc, doc.reading) && slow.every((t, i) => t >= base[i]!) && slow.some((t, i) => t > base[i]!);
  await uiShot(page, "plan-wps-2.3");
  await reading.getByLabel("Слов в секунду").fill("2,5");
  await reading.getByRole("button", { name: "Применить" }).click();
  doc = await nextRev();
  const back = accepted(doc).map((x) => x.frames.total);
  const backOk = doc.reading.wps === 2.5 && framesFor(doc, doc.reading) && JSON.stringify(back) === JSON.stringify(base);
  ops.reading = { base_total: base, wps_2_3_total: slow, back_total: back };

  const blocking = doc.issues.filter((x) => x.severity === "blocking");
  const ideaOf = (id: string) => doc.items.find((x) => x.id === id)?.idea.trim() ?? "";
  check("13.5", "правка плана через UI: убрать, добавить по выделению, сменить приём (идеи дописаны Director), скорость 2,3 и обратно 2,5 (длительности пересчитаны)",
    doc.items.find((x) => x.id === removed.id)?.status === "rejected" && doc.items.find((x) => x.id === added.id)?.status === "accepted" &&
      doc.items.find((x) => x.id === target.id)?.technique === technique && ideaOf(added.id) !== "" && ideaOf(target.id) !== "" &&
      slowOk && backOk && blocking.length === 0,
    { ...ops, revision: doc.revision, blocking: blocking.map((x) => x.code), warnings: doc.issues.filter((x) => x.severity === "warning").map((x) => x.code) });
  writeEvidence("plan-final.json", doc);
  await plan.getByRole("button", { name: /^Утвердить и сгенерировать/ }).scrollIntoViewIfNeeded();
  await uiShot(page, "plan");
  timeStep("edit", t0);
});

step("generate")("п.6–8: «Утвердить и сгенерировать», рестарт сервера через 5 мин, повтор упавших", async ({ page }) => {
  test.setTimeout(GEN_TIMEOUT + 3600_000);
  const projectId = await openProject(page);
  // продолжение (state.json с batchId): пакет уже поставлен — только ждать, не утверждать заново
  const resumed = state().batchId;
  let b0: ScriptBatchDto;
  let t0 = Date.now();
  if (resumed) {
    b0 = await batch(page.request, resumed);
    t0 = Date.parse(state().batchStartedAt ?? new Date().toISOString());
  } else {
    await tab(page, "План");
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/script/generate")),
      page.getByTestId("plan-tab").getByRole("button", { name: /^Утвердить и сгенерировать/ }).click(),
    ]);
    expect(resp.status(), await resp.text()).toBeLessThan(300);
    b0 = (await resp.json()) as ScriptBatchDto;
    saveState({ batchId: b0.id, batchStartedAt: new Date(t0).toISOString() });
    await expect(page.getByRole("tab", { name: "Сцены", exact: true })).toHaveAttribute("aria-selected", "true");
  }
  log(`пакет ${b0.id}: ${b0.items.length} сцен, задач ${b0.items.filter((x) => x.job).length}${resumed ? " (продолжение)" : ""}`);

  // рестарт посреди пакета: SIGTERM через 5 мин после старта, затем снова `npm start`
  let restarted = state().restart !== undefined;
  let runningAtStop = state().restart?.running ?? [];
  await waitBatches(page, [b0.id], async () => {
    if (restarted || Date.now() - t0 < RESTART_AFTER_MS) return;
    restarted = true;
    const b = await batch(page.request, b0.id);
    runningAtStop = b.items.filter((x) => x.job?.status === "running").map((x) => ({ item: x.item_id, job: x.job!.id, stage: x.job!.stage }));
    const pidBefore = state().serverPid;
    const s0 = Date.now();
    saveState({ restart: { atMs: s0 - t0, pidBefore, pidAfter: 0, downMs: 0, running: runningAtStop } });
    await stopServer("SIGTERM");
    await startServer();
    saveState({ restart: { atMs: s0 - t0, pidBefore, pidAfter: state().serverPid, downMs: Date.now() - s0, running: runningAtStop } });
    log(`рестарт: SIGTERM ${pidBefore} → новый сервер ${state().serverPid}, выполнялись ${JSON.stringify(runningAtStop)}`);
    await page.reload();
  });
  const firstPassMs = Date.now() - t0;
  let b = await batch(page.request, b0.id);
  const firstFailed = b.items.filter((x) => x.status !== "ready");

  // упавшие — «Повторить генерацию» один раз (через UI)
  const retryIds: string[] = [];
  for (const x of firstFailed) retryIds.push(await retryViaUi(page, x.item_id, "16:9"));
  saveState({ retryBatchIds: retryIds });
  if (retryIds.length > 0) await waitBatches(page, retryIds);
  timeStep("generate", t0);
  b = await batch(page.request, b0.id);
  const st = await scriptState(page.request, projectId);
  const doc = st.plan!.doc;
  const acc = accepted(doc);
  const scenes = acc.map((item) => ({ item, scene: st.scenes.find((s) => s.item_id === item.id && s.aspect === "16:9") }));
  const ready = scenes.filter((s) => s.scene?.status === "ready");

  // стоимость по задачам: первый проход и повторы, по блокам
  const jobsOf = (itemId: string) => db((d) => d.prepare("SELECT id, status, attempt, interrupts, created_at, started_at, finished_at FROM jobs WHERE type = 'playground.generate' AND scene_id = ? ORDER BY created_at").all(scenes.find((s) => s.item.id === itemId)?.scene?.scene_id ?? "") as { id: string; status: string; attempt: number; interrupts: number; created_at: string; started_at: string | null; finished_at: string | null }[]);
  const perScene = scenes.map((s) => {
    const js = jobsOf(s.item.id);
    return { item: s.item.id, block: s.item.block_id, technique: s.item.technique, status: s.scene?.status ?? "none", jobs: js.map((x) => ({ ...x, cost_usd: Number(jobCost(x.id).toFixed(3)) })) };
  });
  const total = perScene.flatMap((s) => s.jobs).reduce((a, x) => a + x.cost_usd, 0);
  addCost("generate", total);
  for (const blk of ["b1", "b2", "b3"]) addCost(`generate.${blk}`, perScene.filter((s) => s.block === blk).flatMap((s) => s.jobs).reduce((a, x) => a + x.cost_usd, 0));
  writeEvidence("generate.json", { batch: b0.id, retries: retryIds, first_pass_ms: firstPassMs, restart: state().restart, running_at_stop: runningAtStop, scenes: perScene });

  check("13.6", "≥ 90 % принятых сцен ready (после ≤ 1 повтора); сбой одной не остановил остальные",
    ready.length / acc.length >= 0.9,
    { accepted: acc.length, ready: ready.length, share: Number((ready.length / acc.length).toFixed(3)), failed_first_pass: firstFailed.map((x) => ({ item: x.item_id, status: x.status, error: x.job?.error?.code ?? null })), retried: retryIds.length, not_ready: scenes.filter((s) => s.scene?.status !== "ready").map((s) => ({ item: s.item.id, status: s.scene?.status, error: s.scene?.job?.error ?? null })) });

  // п.7: длительность версии = frames.total плана
  const durations = await Promise.all(ready.map(async (s) => {
    const d = await getJson<SceneDetailDto>(page.request, `/api/scenes/${s.scene!.scene_id}`);
    const v = d.versions.find((x) => x.version_id === s.scene!.version_id);
    return { item: s.item.id, plan_total: s.item.frames.total, version: v?.duration_frames ?? null };
  }));
  const wrong = durations.filter((x) => x.version !== x.plan_total);
  check("13.7", "длительность каждой версии = frames.total плана", ready.length > 0 && wrong.length === 0, { checked: durations.length, wrong, durations });

  // п.8: рестарт посреди пакета — задачи дошли до конца, дублей версий нет
  const versionsPerScene = ready.map((s) => ({ item: s.item.id, versions: db((d) => d.prepare("SELECT COUNT(*) FROM scene_versions WHERE scene_id = ?").pluck().get(s.scene!.scene_id) as number) }));
  const dup = versionsPerScene.filter((x) => x.versions !== 1);
  const interrupted = runningAtStop.map((r) => {
    const s = perScene.find((x) => x.jobs.some((j) => j.id === r.job));
    return { ...r, item: s?.item ?? r.item, after: s?.jobs.find((j) => j.id === r.job) };
  });
  const stuck = b.items.filter((x) => x.status === "pending" || x.status === "running");
  check("13.8", "рестарт сервера посреди пакета: задачи доходят до конца, дублей версий нет",
    restarted && runningAtStop.length > 0 && stuck.length === 0 && dup.length === 0 && interrupted.every((r) => r.after && terminal(r.after.status)),
    { restart: state().restart, running_at_stop: interrupted, stuck: stuck.map((x) => x.item_id), versions_not_1: dup });
  await page.reload();
  await tab(page, "Сцены");
  await uiShot(page, "scenes");
});

step("package-v1")("папка 16:9 до доработки (для п.11)", async ({ page }) => {
  test.setTimeout(120 * 60_000);
  const t0 = Date.now();
  const { id, ms } = await buildPackage(page, "16:9");
  saveState({ packages: { ...state().packages, before: id } });
  log(`папка 16:9 (v1): ${id} за ${Math.round(ms / 1000)} с`);
  timeStep("package-v1", t0);
});

step("refine")("п.11: «Доработать» → чат «сделай число крупнее и медленнее» → v2", async ({ page }) => {
  test.setTimeout(90 * 60_000);
  const t0 = Date.now();
  const projectId = await openProject(page);
  const st = await scriptState(page.request, projectId);
  const acc = accepted(st.plan!.doc);
  const ready = acc.filter((x) => st.scenes.some((s) => s.item_id === x.id && s.aspect === "16:9" && s.status === "ready"));
  const item = ready.find((x) => x.technique === "hero-number" && x.data.length > 0) ?? ready.find((x) => x.technique === "hero-number") ?? ready.find((x) => x.data.length > 0) ?? ready[0]!;
  const scene = st.scenes.find((s) => s.item_id === item.id && s.aspect === "16:9")!;
  await tab(page, "Сцены");
  await tile(page, item.id).getByRole("link", { name: "Доработать в Playground" }).click();
  await expect(page).toHaveURL(new RegExp(`/scenes/${scene.scene_id}$`));
  await page.getByRole("region", { name: "Чат" }).getByLabel("Сообщение").fill(REFINE_TEXT);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/api/scenes/${scene.scene_id}/messages`)),
    page.getByRole("button", { name: "Отправить" }).click(),
  ]);
  expect(resp.status(), await resp.text()).toBe(202);
  const jobId = ((await resp.json()) as { job: { id: string } }).job.id;
  const j = await waitJob(page.request, jobId, 80 * 60_000, 30_000);
  const d = await getJson<SceneDetailDto>(page.request, `/api/scenes/${scene.scene_id}`);
  const v2 = d.versions.find((v) => v.number === 2) ?? null;
  saveState({ refine: { itemId: item.id, sceneId: scene.scene_id, v1: scene.version_id!, v2: v2?.version_id ?? null, jobId } });
  addCost("refine", jobCost(jobId));
  timeStep("refine", t0);
  check("13.11a", "доработка чатом → v2 ready и текущая", j.status === "completed" && v2?.status === "ready" && d.scene.current_version_id === v2.version_id,
    { item: item.id, technique: item.technique, quote: item.quote, job: j.status, error: j.error, v1: scene.version_id, v2: v2?.version_id ?? null, v2_status: v2?.status ?? null, current: d.scene.current_version_id, cost_usd: Number(jobCost(jobId).toFixed(3)) });
  await uiShot(page, "refine-playground");
});

step("package")("п.9–11: папка 16:9 — ffprobe, альфа, шпаргалка, v2 в пересборке", async ({ page }) => {
  test.setTimeout(180 * 60_000);
  const t0 = Date.now();
  const { id, ms } = await buildPackage(page, "16:9");
  saveState({ packages: { ...state().packages, after: id } });
  timeStep("package", t0);
  const projectId = state().projectId!;
  const st = await scriptState(page.request, projectId);
  const doc = st.plan!.doc;
  const acc = accepted(doc);
  const p = await pkg(page.request, id);
  const man = manifestOf(p.abs_path);
  await uiShot(page, "export");

  // п.9: каждая готовая сцена — mp4 (h264 1920×1080 30 fps aac) и _alpha.mov (prores 4444, yuva, угол 0, покрытие)
  const readyItems = acc.filter((x) => st.scenes.some((s) => s.item_id === x.id && s.aspect === "16:9" && s.status === "ready" && !s.stale));
  const rows = [];
  for (const f of p.files) {
    const item = acc.find((x) => x.id === f.item_id)!;
    const mp4 = probe(join(p.abs_path, f.mp4));
    const sceneVer = man.scenes.find((s) => s.item_id === f.item_id)!.version_id;
    const v = await getJson<VersionDto>(page.request, `/api/versions/${sceneVer}`);
    const spec = JSON.parse(readFileSync(join(versionPath(sceneVer), "spec.json"), "utf8")) as MotionSpec;
    const row: Record<string, unknown> = { n: f.n, item: f.item_id, mp4: f.mp4, alpha: f.alpha, version: v.manifest.version_id };
    const mp4Ok = /^\d{2,3}_[a-z0-9-]+\.mp4$/.test(f.mp4) && mp4.codec === "h264" && mp4.width === 1920 && mp4.height === 1080 && mp4.fps === "30/1" && mp4.audio === "aac" && mp4.frames === item.frames.total;
    row.mp4_probe = mp4;
    row.mp4_ok = mp4Ok;
    if (f.alpha) {
      const mov = join(p.abs_path, f.alpha);
      const ap = probe(mov);
      const frames = overlayFrames(spec, item.frames);
      const corner = await alphaAtCorner(mov, frames[0]!);
      const cov = await alphaCoverage(mov, frames);
      const alphaOk = f.alpha === f.mp4.replace(/\.mp4$/, "_alpha.mov") && ap.codec === "prores" && /4444/.test(ap.profile ?? "") && /^yuva/.test(ap.pixFmt ?? "") &&
        ap.width === 1920 && ap.height === 1080 && corner === 0 && cov.opaque >= 0.005 && cov.opaque <= 0.92;
      Object.assign(row, { alpha_probe: ap, corner_alpha: corner, coverage: { opaque: Number(cov.opaque.toFixed(4)), haze: Number(cov.haze.toFixed(4)), frames }, alpha_ok: alphaOk });
    } else row.alpha_ok = false;
    rows.push(row);
  }
  const missingReady = readyItems.filter((x) => !p.files.some((f) => f.item_id === x.id)).map((x) => x.id);
  check("13.9", "папка 16:9: на каждую готовую сцену NN_slug.mp4 (h264 1920×1080 30 fps aac) и NN_slug_alpha.mov (prores 4444 yuva, угол α=0, непрозрачная доля 0,5–92 %)",
    p.files.length === readyItems.length && missingReady.length === 0 && rows.every((r) => r.mp4_ok && r.alpha_ok),
    { package: id, display_name: p.display_name, build_ms: ms, files: p.files.length, ready: readyItems.length, missing: p.missing, missing_ready: missingReady, bad: rows.filter((r) => !r.mp4_ok || !r.alpha_ok).map((r) => ({ item: r.item, mp4_ok: r.mp4_ok, alpha_ok: r.alpha_ok, coverage: r.coverage, corner: r.corner_alpha })) });
  writeEvidence("package-16x9.json", { package: p, files: rows });

  // п.10: шпаргалка md/csv/txt — строк = сцен плана, фразы = цитаты плана, имена файлов существуют
  const md = readFileSync(join(p.abs_path, "шпаргалка.md"), "utf8");
  const csv = readFileSync(join(p.abs_path, "шпаргалка.csv"), "utf8");
  const txt = readFileSync(join(p.abs_path, "шпаргалка.txt"), "utf8");
  for (const [n, s] of [["шпаргалка-16x9.md", md], ["шпаргалка-16x9.csv", csv], ["шпаргалка-16x9.txt", txt]] as const) writeEvidence(n, s);
  const names = new Set(readdirSync(p.abs_path));
  const fileOk = (name: string) => name === "—" || name === "" || names.has(name);
  const mdRows = md.split("\n").filter((l) => /^\| \d{2,3} \|/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const csvRows = parseCsv(csv).slice(1);
  const txtRows = txt.trimEnd().split("\n");
  const quotes = acc.map((x) => norm(x.quote));
  const mdPhrases = mdRows.map((r) => norm(r[5] ?? ""));
  const csvPhrases = csvRows.map((r) => norm(r[5] ?? ""));
  const txtPhrases = txtRows.map((l) => norm(/«(.*)»/.exec(l)?.[1] ?? ""));
  const same = (a: string[]) => a.length === quotes.length && a.every((q, i) => q === quotes[i]);
  const filesExist = [...mdRows, ...csvRows].every((r) => fileOk(r[1] ?? "") && fileOk(r[2] ?? ""));
  check("13.10", "шпаргалка md/csv/txt: строк = сцен, фразы = цитаты плана, имена файлов существуют",
    same(mdPhrases) && same(csvPhrases) && same(txtPhrases) && filesExist && csv.startsWith(BOM),
    { scenes: acc.length, md_rows: mdRows.length, csv_rows: csvRows.length, txt_rows: txtRows.length, files_exist: filesExist, bom: csv.startsWith(BOM),
      phrase_mismatch: { md: mdPhrases.filter((q, i) => q !== quotes[i]).length, csv: csvPhrases.filter((q, i) => q !== quotes[i]).length, txt: txtPhrases.filter((q, i) => q !== quotes[i]).length } });

  // п.11: пересборка после v2 берёт v2
  const { refine, packages } = state();
  const before = packages?.before ? manifestOf((await pkg(page.request, packages.before)).abs_path).scenes.find((s) => s.item_id === refine?.itemId)?.version_id : undefined;
  const after = man.scenes.find((s) => s.item_id === refine?.itemId)?.version_id;
  check("13.11", "доработка в Playground чатом → v2; повторная сборка папки берёт v2",
    refine?.v2 !== null && refine?.v2 !== undefined && before === refine.v1 && after === refine.v2,
    { item: refine?.itemId, v1: refine?.v1, v2: refine?.v2, package_before: packages?.before, version_before: before, package_after: id, version_after: after });
});

step("vertical")("п.12: «Переделать под 9:16» для двух сцен → «Собрать папку 9:16»", async ({ page }) => {
  test.setTimeout(GEN_TIMEOUT);
  const t0 = Date.now();
  const projectId = await openProject(page);
  let st = await scriptState(page.request, projectId);
  const acc = accepted(st.plan!.doc);
  const { refine } = state();
  const ready = acc.map((x, i) => ({ x, n: i + 1 })).filter(({ x }) => x.id !== refine?.itemId && st.scenes.some((s) => s.item_id === x.id && s.aspect === "16:9" && s.status === "ready"));
  const first = ready.find(({ x }) => x.technique !== "kinetic-quote") ?? ready[0]!;
  const second = ready.find(({ x }) => x.technique !== first.x.technique && x.technique !== "kinetic-quote" && x.id !== first.x.id) ?? ready.find(({ x }) => x.id !== first.x.id)!;
  const picked = [first, second];
  await tab(page, "Экспорт");
  const panel = page.getByTestId("reframe");
  for (const { n } of picked) await panel.locator("li").filter({ has: page.locator("strong", { hasText: new RegExp(`^Сцена ${n}$`) }) }).getByRole("checkbox").check();
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/script/reframe")),
    panel.getByRole("button", { name: "Переделать выбранные (2)" }).click(),
  ]);
  expect(resp.status(), await resp.text()).toBeLessThan(300);
  const b = (await resp.json()) as ScriptBatchDto;
  const ids = [b.id];
  await waitBatches(page, [b.id]);
  const failed = (await batch(page.request, b.id)).items.filter((x) => x.status !== "ready");
  for (const x of failed) ids.push(await retryViaUi(page, x.item_id, "9:16"));
  if (ids.length > 1) await waitBatches(page, ids.slice(1));
  saveState({ reframe: { itemIds: picked.map(({ x }) => x.id), batchIds: ids } });
  const twinJobs = db((d) => d.prepare(`SELECT j.id FROM jobs j JOIN script_scenes s ON s.scene_id = j.scene_id WHERE s.aspect = '9:16' AND j.type = 'playground.generate' AND s.item_id IN (${picked.map(() => "?").join(",")})`).pluck().all(...picked.map(({ x }) => x.id)) as string[]);
  addCost("vertical", twinJobs.reduce((a, jid) => a + jobCost(jid), 0));
  const genMs = Date.now() - t0;
  const { id } = await buildPackage(page, "9:16");
  saveState({ packages: { ...state().packages, vertical: id } });
  timeStep("vertical", t0);
  st = await scriptState(page.request, projectId);
  const twins = picked.map(({ x }) => ({ item: x.id, technique: x.technique, scene: st.scenes.find((s) => s.item_id === x.id && s.aspect === "9:16") }));
  const p = await pkg(page.request, id);
  const files = p.files.map((f) => ({ item: f.item_id, mp4: probe(join(p.abs_path, f.mp4)), alpha: f.alpha ? probe(join(p.abs_path, f.alpha)) : null }));
  for (const [n, f] of [["шпаргалка-9x16.md", "шпаргалка.md"]] as const) writeEvidence(n, readFileSync(join(p.abs_path, f), "utf8"));
  writeEvidence("package-9x16.json", { package: p, files });
  check("13.12", "9:16 для 2 сцен: двойники ready, 1080×1920, папка 9:16",
    twins.every((t) => t.scene?.status === "ready") && p.aspect === "9:16" && p.files.length === 2 &&
      files.every((f) => f.mp4.width === 1080 && f.mp4.height === 1920 && f.mp4.codec === "h264" && f.alpha?.width === 1080 && f.alpha?.height === 1920),
    { twins: twins.map((t) => ({ item: t.item, technique: t.technique, status: t.scene?.status, version: t.scene?.version_id })), batches: ids, generate_ms: genMs, package: id, missing: p.missing, files: files.map((f) => ({ item: f.item, mp4: `${f.mp4.codec} ${f.mp4.width}×${f.mp4.height}`, alpha: f.alpha ? `${f.alpha.codec} ${f.alpha.pixFmt} ${f.alpha.width}×${f.alpha.height}` : null })) });
  await openProject(page);
  await tab(page, "Сцены");
  await page.getByRole("radio", { name: "9:16" }).check();
  await uiShot(page, "scenes-9x16");
});

step("quality")("п.13, п.17: разнообразие пакета, судья по сценам, кадры", async ({ page }) => {
  test.setTimeout(240 * 60_000);
  const t0 = Date.now();
  const projectId = state().projectId!;
  const st: ScriptStateDto = await scriptState(page.request, projectId);
  const acc = accepted(st.plan!.doc);
  const rows = acc.map((item, i) => ({ n: i + 1, item, scene: st.scenes.find((s) => s.item_id === item.id && s.aspect === "16:9") })).filter((r) => r.scene?.status === "ready");
  const notRealized = rows.filter((r) => r.scene!.warnings.some((w) => w.code === "technique_not_realized"));
  const fade = rows.filter((r) => r.scene!.qa_warnings.some((w) => w.code === "uniform_entrance"));
  check("13.13", "разнообразие пакета: technique_not_realized ≤ 20 % сцен, uniform_entrance (fade) ≤ 20 %",
    rows.length > 0 && notRealized.length / rows.length <= 0.2 && fade.length / rows.length <= 0.2,
    { scenes: rows.length, technique_not_realized: notRealized.map((r) => r.item.id), uniform_entrance: fade.map((r) => r.item.id),
      warnings: Object.fromEntries(rows.map((r) => [r.item.id, [...r.scene!.warnings.map((w) => w.code), ...r.scene!.qa_warnings.map((w) => `qa:${w.code}`)]])) });

  // кадры ≤ 480 px из MP4 папки 16:9: середина речи и финал; 9:16 — так же
  const after = await pkg(page.request, state().packages!.after!);
  for (const f of after.files) {
    const item = acc.find((x) => x.id === f.item_id)!;
    const name = `${String(f.n).padStart(2, "0")}-${item.technique}`;
    frame480(join(after.abs_path, f.mp4), item.frames.lead + Math.floor(item.frames.speech / 2), join(EVIDENCE, "frames", `${name}-mid.png`));
    frame480(join(after.abs_path, f.mp4), item.frames.total - 1, join(EVIDENCE, "frames", `${name}-final.png`));
  }
  if (state().packages?.vertical) {
    const v = await pkg(page.request, state().packages!.vertical!);
    for (const f of v.files) {
      const item = acc.find((x) => x.id === f.item_id)!;
      const name = `9x16-${String(acc.indexOf(item) + 1).padStart(2, "0")}-${item.technique}`;
      frame480(join(v.abs_path, f.mp4), item.frames.lead + Math.floor(item.frames.speech / 2), join(EVIDENCE, "frames", `${name}-mid.png`));
      frame480(join(v.abs_path, f.mp4), item.frames.total - 1, join(EVIDENCE, "frames", `${name}-final.png`));
    }
  }

  // судья bench по превью текущей версии каждой готовой сцены (справочно), по 3 параллельно
  const { scratchRoot } = state();
  const config = loadConfig({ ...process.env, MS_DATA_DIR: ACC_ROOT }, await readConfigFile(ACC_ROOT));
  const agents = judgeRuntime({ bin: config.claudeBin, logRoot: join(scratchRoot, "logs", "judge"), systemPrompt: await loadJudgePrompt() });
  const results: NonNullable<AccState["judge"]> = { ...(state().judge ?? {}) };
  const todo = rows.filter((r) => !results[r.item.id] || "error" in results[r.item.id]!);
  const one = async (r: (typeof rows)[number]) => {
    const vdir = versionPath(r.scene!.version_id!);
    const m = (await getJson<VersionDto>(page.request, `/api/versions/${r.scene!.version_id!}`)).manifest;
    const name = `${String(r.n).padStart(2, "0")}-${r.item.technique}`;
    try {
      if (!m.preview) throw new Error("у версии нет превью");
      const jdir = join(state().runDir, "judge", name);
      await prepareJudgeInput(join(vdir, m.preview.path), jdir, { prompt: r.item.quote, duration_frames: r.item.frames.total, fps: 30 });
      const res = await runJudge({ agents, dir: jdir, anchors: REFERENCE, durationFrames: r.item.frames.total, model: "opus", runRef: { root: scratchRoot, runId: `s12-judge-${r.item.id}-${Date.now()}`, attempt: 1 }, signal: new AbortController().signal });
      results[r.item.id] = res.output
        ? { overall: res.output.overall, notes: Object.fromEntries(Object.entries(res.output.criteria).map(([k, v]) => [k, `${v.score}: ${v.note}`])), summary: res.output.summary, cost_usd: res.usage.costUsd }
        : { error: JSON.stringify(res.error).slice(0, 300) };
    } catch (e) {
      results[r.item.id] = { error: (e as Error).message.slice(0, 300) };
    }
    log(`судья ${name}: ${JSON.stringify(results[r.item.id]).slice(0, 120)}`);
    saveState({ judge: results });
  };
  for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(one));
  const scores = rows.map((r) => results[r.item.id]).filter((x): x is { overall: number; notes: Record<string, string>; summary: string; cost_usd: number } => x !== undefined && "overall" in x).map((x) => x.overall).sort((a, b) => a - b);
  const median = scores.length === 0 ? null : scores.length % 2 ? scores[(scores.length - 1) / 2]! : (scores[scores.length / 2 - 1]! + scores[scores.length / 2]!) / 2;
  addCost("judge", Object.values(results).reduce((a, x) => a + ("cost_usd" in x ? x.cost_usd : 0), 0));
  check("13.17", "судья (rubric-judge) по сценам — справочно, медиана", scores.length > 0,
    { median, judged: scores.length, scenes: rows.length, per_scene: Object.fromEntries(rows.map((r) => [`${String(r.n).padStart(2, "0")} ${r.item.id} ${r.item.technique}`, results[r.item.id] && "overall" in results[r.item.id]! ? (results[r.item.id] as { overall: number }).overall : results[r.item.id]])) }, "A (инф.)");

  // [sweep-error] временного прохода пробы в журналах версий проекта (известное: «Page crashed!»)
  const versionDirs = db((d) => d.prepare("SELECT v.path FROM scene_versions v JOIN scenes s ON s.id = v.scene_id WHERE s.project_id = ?").pluck().all(projectId) as string[]);
  let sweep = 0;
  for (const rel of versionDirs) {
    try {
      sweep += Number(execFileSync("grep", ["-rhoF", "[sweep-error]", join(ACC_ROOT, rel)], { encoding: "utf8" }).trim().split("\n").filter(Boolean).length);
    } catch {
      // grep: нет совпадений
    }
  }
  timeStep("quality", t0);
  writeEvidence("summary.json", {
    project_id: projectId, plan_id: st.plan!.plan_id, plan_revision: st.plan!.doc.revision, times: state().times, costs: state().costs, restart: state().restart,
    refine: state().refine, packages: state().packages, reframe: state().reframe, sweep_error_in_version_dirs: sweep,
    scenes: acc.map((item, i) => {
      const s = st.scenes.find((x) => x.item_id === item.id && x.aspect === "16:9");
      const j = results[item.id];
      return { n: i + 1, item: item.id, block: item.block_id, technique: item.technique, structure_rule: item.structure_rule ?? null, origin: item.origin, quote: item.quote, frames: item.frames, status: s?.status ?? "none", version: s?.version_id ?? null,
        warnings: s?.warnings.map((w) => w.code) ?? [], qa_warnings: s?.qa_warnings.map((w) => w.code) ?? [], judge: j ?? null };
    }),
  });
});
