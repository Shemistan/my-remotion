// Video Workspace Phase 2 (Task 29): настоящий сервер на tmp-хранилище, реальные ffmpeg и
// ASR-воркер ai-platform, без LLM. Новый видеопроект → импорт `talk-ru-cfr.mp4` по пути →
// распознавание → правка слова (r2, r1 доступна) → предложение монтажа без агента → принять /
// восстановить → принять всё → превью → «После монтажа» играет → Approval A → `kill -9` сервера и
// старт → всё на месте, A валиден → правка статуса вырезки → A «устарело». Скриншоты —
// docs/evidence/phase-2/ui/.
import { spawn } from "node:child_process";
import { openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { APP, EVIDENCE_VIDEO, MEDIA_FIXTURES, PORT, STATE_FILE, shot, state } from "./helpers.js";

const JOB_TIMEOUT = 180_000;
const snap = (page: Page, name: string) => shot(page, name, EVIDENCE_VIDEO);

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** `kill -9` сервера и новый старт на том же хранилище (owner-lock мёртвого процесса снимается). */
async function restartServer(): Promise<void> {
  const st = state();
  process.kill(st.serverPid, "SIGKILL");
  for (let i = 0; i < 100 && alive(st.serverPid); i++) await new Promise((r) => setTimeout(r, 100));
  const env = { ...process.env, MS_DATA_DIR: st.root, MS_ALLOW_SYSTEM_DISK: "1", MS_LOG_LEVEL: "warn" };
  const fd = openSync(st.serverLog, "a");
  const server = spawn(process.execPath, ["--import", "tsx", "server/src/main.ts"], { cwd: APP, env, stdio: ["ignore", fd, fd] });
  server.unref();
  writeFileSync(STATE_FILE, JSON.stringify({ ...st, serverPid: server.pid }, null, 2));
  const until = Date.now() + 60_000;
  for (;;) {
    const ok = await fetch(`http://127.0.0.1:${PORT}/api/health`).then((r) => r.ok).catch(() => false);
    if (ok) return;
    if (Date.now() > until) throw new Error("сервер не поднялся после kill -9");
    await new Promise((r) => setTimeout(r, 500));
  }
}

const job = (page: Page, type: string): Locator => page.locator("[data-job]").filter({ hasText: type });
async function jobDone(page: Page, type: string): Promise<void> {
  await expect(job(page, type).locator(".badge").first()).toHaveText("готово", { timeout: JOB_TIMEOUT });
}
const summary = async (page: Page) => (await page.getByTestId("roughcut-summary").textContent()) ?? "";
const after = (s: string) => Number(/стало ([\d,]+)/.exec(s)![1]!.replace(",", "."));
const tab = (page: Page, name: string) => page.getByRole("tab", { name }).click();

test("Video Workspace: импорт → ASR → правка → черновой монтаж → превью → A → перезапуск", async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto("/");
  await page.getByLabel("Название проекта").fill(`Видео e2e ${Date.now()}`);
  await page.getByRole("button", { name: "Новый видеопроект" }).click();
  await expect(page.getByLabel("Путь к файлу на этом Mac")).toBeVisible();
  await expect(page.getByTestId("approval-A")).toContainText("нет");
  await snap(page, "01-new-video-project");

  // импорт по пути вне корней — понятная ошибка без путей хранилища
  await page.getByLabel("Путь к файлу на этом Mac").fill("/etc/hosts");
  await page.getByRole("button", { name: "Импортировать" }).click();
  await expect(page.locator(".media-import .error")).toContainText("Файл не годится для импорта");

  await page.getByLabel("Путь к файлу на этом Mac").fill(join(MEDIA_FIXTURES, "talk-ru-cfr.mp4"));
  await page.getByRole("button", { name: "Импортировать" }).click();
  await jobDone(page, "Импорт видео");
  await expect(page.getByTestId("media-info")).toContainText("кадр/с", { timeout: 30_000 });
  await expect(page.getByTestId("media-info")).toContainText("только чтение");
  await expect(page.locator(".proxy-player video")).toHaveJSProperty("readyState", 4, { timeout: 30_000 });
  await expect(page.locator(".thumb img").first()).toBeVisible();
  await snap(page, "02-media-imported");

  await page.getByRole("button", { name: "Распознать речь", exact: true }).click();
  await jobDone(page, "Распознавание речи");
  await tab(page, "Транскрипт");
  await expect(page.locator(".word").nth(10)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".panel h2 .badge")).toHaveText("ревизия r1");
  await page.locator(".word").nth(3).click();
  await expect(page.locator(".word.current")).toHaveCount(1);
  await snap(page, "03-transcript");

  // правка слова → r2; r1 открывается и не изменена
  const firstWord = (await page.locator(".word").first().textContent())!;
  await page.getByRole("button", { name: "Править" }).first().click();
  const box = page.getByRole("textbox", { name: "Текст сегмента" });
  const text = await box.inputValue();
  await box.fill(text.replace(firstWord, "Здравствуйте,"));
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator(".panel h2 .badge")).toHaveText("ревизия r2");
  await expect(page.locator(".word").first()).toHaveText("Здравствуйте,");
  const r1 = page.locator('.revision-list li[data-revision="1"]');
  await expect(r1).toContainText("ASR, оригинал");
  await r1.getByRole("button", { name: "Открыть" }).click();
  await expect(page.getByText("Открыта ревизия r1 — только чтение.")).toBeVisible();
  await expect(page.locator(".word").first()).toHaveText(firstWord);
  await r1.getByRole("button", { name: "Сравнить с текущей" }).click();
  await expect(page.getByTestId("word-diff")).toContainText("Здравствуйте,");
  await snap(page, "04-transcript-r2-compare");
  await page.getByRole("button", { name: "К текущей" }).click();

  // черновой монтаж без агента
  await tab(page, "Черновой монтаж");
  await page.getByRole("button", { name: "Предложить монтаж" }).click();
  await jobDone(page, "Черновой монтаж");
  await expect(page.locator(".cut-row").filter({ hasText: "пауза" }).first()).toBeVisible({ timeout: 30_000 });
  const before = await summary(page);
  await snap(page, "05-roughcut-proposed");

  const filler = page.locator(".cut-row").filter({ hasText: "слово-паразит" }).first();
  const target = (await filler.count()) > 0 ? filler : page.locator(".cut-row").filter({ hasText: "пауза" }).first();
  const targetId = (await target.getAttribute("data-testid"))!;
  await target.locator("button[data-action='accept']").click();
  await expect(page.getByTestId(targetId)).toHaveAttribute("data-status", "accepted");
  expect(after(await summary(page))).toBeLessThan(after(before));
  await tab(page, "Транскрипт");
  await expect(page.locator(".word.removed").first()).toBeVisible();
  await snap(page, "06-transcript-cut-struck");
  await tab(page, "Черновой монтаж");
  await page.getByTestId(targetId).locator("button[data-action='restore']").click();
  await expect(page.getByTestId(targetId)).toHaveAttribute("data-status", "rejected");
  await expect.poll(() => summary(page)).toBe(before);

  // принять всё: уверенные (≥ 0,8 и ещё предложенные) одной кнопкой — если такие есть (паразит
  // после «Восстановить» уже отклонён и в эту кнопку не входит), остальные — по одной; каждое
  // нажатие ждёт новую ревизию (кнопки заблокированы, пока правка сохраняется)
  const acceptConfident = page.getByRole("button", { name: "Принять все ≥ 0,8" });
  const confident = page.locator('.cut-row[data-status="proposed"]').filter({ hasText: /уверенность (0,[89]\d|1,00)/ });
  if ((await confident.count()) > 0) {
    await expect(acceptConfident).toBeEnabled();
    await acceptConfident.click();
    await expect(confident).toHaveCount(0);
  } else {
    await expect(acceptConfident).toBeDisabled();
  }
  const left = page.locator('.cut-row[data-status="proposed"], .cut-row[data-status="rejected"]');
  for (let n = await left.count(); n > 0; n--) {
    const accept = left.first().locator("button[data-action='accept']");
    await expect(accept).toBeEnabled();
    await accept.click();
    await expect(left).toHaveCount(n - 1);
  }
  await expect(page.locator('.cut-row[data-status="proposed"]')).toHaveCount(0);
  expect(after(await summary(page))).toBeLessThan(after(before));
  await expect(page.getByRole("button", { name: "Утвердить черновой монтаж (A)" })).toBeEnabled();

  // «После монтажа» без превью: прокси с пропуском вырезок — время не задерживается внутри
  // принятой паузы (замеры каждые 20 мс, пока не прошли её конец)
  const pause = page.locator('.cut-row[data-status="accepted"]').filter({ hasText: "пауза" }).first();
  const [, a0, b0] = /(\d\d:\d\d:\d\d\.\d\d) – (\d\d:\d\d:\d\d\.\d\d)/.exec((await pause.textContent())!)!;
  const sec = (tc: string) => tc.split(":").reduce((acc, x) => acc * 60 + Number(x), 0);
  const [cutA, cutB] = [sec(a0!), sec(b0!)];
  await page.getByRole("radio", { name: "После монтажа" }).click();
  await expect(page.getByTestId("player-note")).toContainText("с пропуском вырезок");
  const video = page.locator(".proxy-player video");
  const samples = await video.evaluate(async (v: HTMLVideoElement, [from, until]) => {
    v.currentTime = from;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
    const out: number[] = [];
    const btn = [...document.querySelectorAll<HTMLButtonElement>(".proxy-player .player-controls button")][0]!;
    btn.click();
    const t0 = performance.now();
    while (v.currentTime < until && performance.now() - t0 < 10_000) {
      out.push(v.currentTime);
      await new Promise((r) => setTimeout(r, 20));
    }
    btn.click();
    out.push(v.currentTime);
    return out;
  }, [cutA - 0.4, cutB + 0.3] as const);
  expect(samples.at(-1)!).toBeGreaterThan(cutB);
  expect(samples.filter((x) => x > cutA + 0.15 && x < cutB - 0.15)).toEqual([]);
  await page.getByRole("radio", { name: "Исходник" }).click();

  await page.getByRole("button", { name: "Собрать превью" }).click();
  await jobDone(page, "Превью монтажа");
  await expect(page.getByRole("button", { name: /Превью r\d+ готово/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("radio", { name: "После монтажа" }).click();
  await expect(page.getByTestId("player-note")).toContainText("превью ревизии r");
  await expect(video).toHaveAttribute("src", /\/api\/edls\/.+\/revisions\/\d+\/preview\.mp4/);
  await expect(video).toHaveJSProperty("readyState", 4, { timeout: 30_000 });
  // играет по-настоящему: время превью уходит вперёд от точки старта (а не «уже > 0,5» после
  // переноса места из режима «Исходник»), счётчик под плеером следует за ним
  const t0 = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  const shown0 = await page.getByTestId("player-time").textContent();
  await page.locator(".proxy-player").getByRole("button", { name: "Воспроизвести" }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(t0 + 1);
  await page.locator(".proxy-player").getByRole("button", { name: "Пауза" }).click();
  await expect(page.getByTestId("player-time")).not.toHaveText(shown0!);
  await page.getByTestId("edited-bar").hover({ position: { x: 120, y: 8 } });
  await expect(page.getByTestId("timeline-hover")).toContainText("после монтажа 00:00:");
  await snap(page, "07-preview-edited-player");

  await page.getByRole("button", { name: "Утвердить черновой монтаж (A)" }).click();
  await expect(page.getByTestId("approval-A")).toContainText("утверждено");
  await snap(page, "08-approved-A");

  // kill -9 и старт: проект, ревизии, превью и A на месте
  await restartServer();
  await page.reload();
  await expect(page.getByTestId("approval-A")).toContainText("утверждено", { timeout: 30_000 });
  await tab(page, "Транскрипт");
  await expect(page.locator(".panel h2 .badge")).toHaveText("ревизия r2");
  await tab(page, "Черновой монтаж");
  await expect(page.getByRole("button", { name: /Превью r\d+ готово/ })).toBeVisible();
  await snap(page, "09-after-restart");

  // правка статуса вырезки → A устарело
  await page.locator('.cut-row[data-status="accepted"]').first().locator("button[data-action='restore']").click();
  await expect(page.getByTestId("approval-A")).toContainText("устарело — монтаж изменился после утверждения");
  await expect(page.getByRole("button", { name: "Собрать превью" })).toBeEnabled();
  await snap(page, "10-A-stale");
});
