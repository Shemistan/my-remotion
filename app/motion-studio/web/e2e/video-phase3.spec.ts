// Анализ и визуальный план в UI (Task 33): настоящий сервер на tmp-хранилище, реальные ffmpeg,
// ASR-воркер и Apple Vision, без LLM. Ролик с лицом автора — `MS_TEST_TALKING_HEAD` (собственный
// материал пользователя, согласие V4; импорт копирует, оригинал только читается). Импорт → ASR →
// черновой монтаж без агента → A → «Анализировать видеоряд» без агента (шоты, рамки на кадре) →
// смысловой анализ и план без агента (пустой план) → сцена по выделенным словам в зоне над лицом →
// blocking «перекрытие лица» → смена зоны → проблемы нет → B «утверждено» → правка стиля → B
// «устарело» → перепроверка → B снова → отклонение вырезки → A и B устарели, «Монтаж изменился» →
// «Перепроверить план» → сцены пересчитаны. Скриншоты: полные — tmp/ui-e2e/phase3-full/, уменьшенные
// до 480 px — tmp/e2e-ui/phase-3/ui/ (MS_WRITE_EVIDENCE=1 — docs/evidence/…, кадры V4).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ZONE_RECTS } from "@ms/contracts";
import { type APIRequestContext, type Locator, type Page, expect, test } from "@playwright/test";
import { EVIDENCE_PHASE3, RUN_DIR, talkingHead } from "./helpers.js";

const JOB_TIMEOUT = 300_000;
const FULL = join(RUN_DIR, "phase3-full");

async function snap(page: Page, name: string): Promise<void> {
  mkdirSync(FULL, { recursive: true });
  mkdirSync(EVIDENCE_PHASE3, { recursive: true });
  const full = join(FULL, `${name}.png`);
  await page.screenshot({ path: full, fullPage: true });
  execFileSync("sips", ["--resampleWidth", "480", full, "--out", join(EVIDENCE_PHASE3, `${name}.png`)], { stdio: "ignore" });
}

const job = (page: Page, type: string): Locator => page.locator("[data-job]").filter({ hasText: type });
async function jobDone(page: Page, type: string): Promise<void> {
  await expect(job(page, type).locator(".badge").first()).toHaveText("готово", { timeout: JOB_TIMEOUT });
}
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();

type Rect = { x: number; y: number; w: number; h: number };
/** Кандидаты зоны сцены поверх автора (геометрия — общая `ZONE_RECTS`). */
const ZONES: Record<string, Rect> = Object.fromEntries((["left_third", "right_third", "top_band", "lower_third"] as const).map((z) => [z, ZONE_RECTS[z]]));
const overlap = (a: Rect, b: Rect) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? (w * h) / (a.w * a.h) : 0;
};

async function api<T>(request: APIRequestContext, path: string): Promise<T> {
  const r = await request.get(path);
  expect(r.ok(), `${path}: ${r.status()}`).toBe(true);
  return (await r.json()) as T;
}

test("анализ видеоряда и визуальный план: лицо, зона, Approval B, стиль, перепроверка после монтажа", async ({ page, request }) => {
  const head = talkingHead();
  if (!head) {
    // пропуск не должен быть тихим: сценарий Phase 3 без ролика с лицом не проверяется вовсе (ревью #10)
    const why = "ПРОПУЩЕН video-phase3: нужен MS_TEST_TALKING_HEAD — ролик с лицом автора (например, tmp/talking-head/MyProtocol-299.833-353.5.mov)";
    console.warn(`\n⚠ ${why}\n`);
    test.info().annotations.push({ type: "skip", description: why });
  }
  test.skip(!head, "нужен MS_TEST_TALKING_HEAD — ролик с лицом автора (например, tmp/talking-head/MyProtocol-299.833-353.5.mov)");
  test.setTimeout(1_800_000);

  await page.goto("/");
  await page.getByLabel("Название проекта").fill(`План e2e ${Date.now()}`);
  await page.getByRole("button", { name: "Новый видеопроект" }).click();
  await page.getByLabel("Путь к файлу на этом Mac").fill(head!);
  await page.getByRole("button", { name: "Импортировать" }).click();
  await jobDone(page, "Импорт видео");
  await expect(page.locator(".proxy-player video")).toHaveJSProperty("readyState", 4, { timeout: 60_000 });
  const projectId = (await page.locator(".video-workspace").getAttribute("data-project-id"))!;

  await page.getByRole("button", { name: "Распознать речь", exact: true }).click();
  await jobDone(page, "Распознавание речи");

  // черновой монтаж без агента: принять всё; вырезок нет — вырезать слово вручную
  await tab(page, "Черновой монтаж");
  await page.getByRole("button", { name: "Предложить монтаж" }).click();
  await jobDone(page, "Черновой монтаж");
  await expect(page.getByTestId("roughcut-summary")).toBeVisible({ timeout: 30_000 });
  const left = page.locator('.cut-row[data-status="proposed"]');
  for (let n = await left.count(); n > 0; n--) {
    await left.first().locator("button[data-action='accept']").click();
    await expect(left).toHaveCount(n - 1);
  }
  if ((await page.locator('.cut-row[data-status="accepted"]').count()) === 0) {
    await tab(page, "Транскрипт");
    await page.locator(".word").nth(2).click();
    await page.getByRole("button", { name: /Вырезать выделенное/ }).click();
    await expect(page.locator(".word.removed").first()).toBeVisible();
    await tab(page, "Черновой монтаж");
  }
  await page.getByRole("button", { name: "Утвердить черновой монтаж (A)" }).click();
  await expect(page.getByTestId("approval-A")).toContainText("утверждено");

  // анализ видеоряда без агента: шоты и рамки лица на кадре
  await tab(page, "Анализ");
  await expect(page.getByRole("button", { name: "Смысловой анализ" })).toBeEnabled();
  await page.getByRole("button", { name: "Анализировать видеоряд" }).click();
  await jobDone(page, "Анализ видеоряда");
  await expect(page.locator(".shot").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("footage-mode")).toContainText("детектор Apple Vision");
  await page.locator(".shot .shot-head").first().click();
  await expect(page.getByTestId("zone-face")).toBeVisible();
  // рамка лица — внутри видимой области видео (letterbox учтён)
  const stage = (await page.locator(".proxy-player .player-stage video").boundingBox())!;
  const face = (await page.getByTestId("zone-face").boundingBox())!;
  expect(face.x).toBeGreaterThanOrEqual(stage.x - 1);
  expect(face.x + face.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
  expect(face.y).toBeGreaterThanOrEqual(stage.y - 1);
  expect(face.y + face.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
  await expect(page.locator(".shot-frames img").first()).toHaveJSProperty("complete", true);
  await snap(page, "01-analysis-shots-zones");

  // агент по умолчанию включён (ревью I1) — UI-e2e без LLM выключает его явно
  const semanticPanel = page.locator(".analysis-semantic");
  await expect(semanticPanel.getByRole("checkbox", { name: "С агентом (LLM)" })).toBeChecked();
  await semanticPanel.getByRole("checkbox", { name: "С агентом (LLM)" }).uncheck();
  await page.getByRole("button", { name: "Смысловой анализ" }).click();
  await jobDone(page, "Смысловой анализ");
  await expect(page.getByTestId("chapters")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("semantic-skipped")).toContainText("без агента");
  await snap(page, "02-analysis-semantic-empty");

  // план без агента — пустой; сцена пользователя по словам в зоне над лицом
  await tab(page, "План");
  // с агентом по разметке без агента план не строится — 409 с понятной причиной (ревью I1)
  const planAgent = page.locator(".plan-panel").getByRole("checkbox", { name: "С агентом (LLM)" });
  await expect(planAgent).toBeChecked();
  await page.getByRole("button", { name: "Построить план" }).click();
  await expect(page.locator(".plan-panel .error")).toContainText("построена без агента");
  await planAgent.uncheck();
  await page.getByRole("button", { name: "Построить план" }).click();
  await jobDone(page, "Визуальный план");
  await expect(page.getByTestId("plan-track")).toContainText("Сцен нет", { timeout: 30_000 });

  const video = await api<{ footage: { id: string } }>(request, `/api/projects/${projectId}/video`);
  const ftg = await api<{ analysis: { shots: { face: { union?: Rect } }[] } }>(request, `/api/footage/${video.footage.id}`);
  const faceRect = ftg.analysis.shots.find((s) => s.face.union)?.face.union;
  expect(faceRect, "Vision не нашёл лицо в ролике").toBeTruthy();
  const ranked = Object.entries(ZONES).map(([z, r]) => ({ z, o: overlap(faceRect!, r) })).sort((a, b) => b.o - a.o);
  const onFace = ranked[0]!.z;
  const away = ["left_third", "right_third"].map((z) => ({ z, o: overlap(faceRect!, ZONES[z]!) })).sort((a, b) => a.o - b.o)[0]!.z;
  expect(ranked[0]!.o, "лицо не попадает ни в одну зону").toBeGreaterThan(0.1);

  const words = page.locator(".video-right .word:not(.removed)");
  const total = await words.count();
  const from = Math.floor(total * 0.4);
  await words.nth(from).click();
  await words.nth(from + 7).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: /Добавить сцену/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Зона").selectOption(onFace);
  await dialog.getByLabel("Назначение").fill("показать главную мысль фрагмента");
  await dialog.getByRole("button", { name: "Добавить" }).click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toBeVisible();
  await expect(page.locator('.plan-issues li[data-code="face_overlap"]').first()).toContainText("перекрытие лица");
  // текст проблемы — по-русски, без кода зоны; id сцены отделён от названия (ревью V2)
  await expect(page.locator('.plan-issues li[data-code="face_overlap"]').first()).not.toContainText(onFace);
  await expect(page.locator('.plan-issues li[data-code="face_overlap"]').first()).toContainText(/sp_\d+ перекрытие лица/);
  await expect(page.getByTestId("zone-plan")).toHaveClass(/bad/);
  await expect(page.getByRole("button", { name: "Утвердить визуальный план (B)" })).toBeDisabled();
  await expect(page.getByTestId("b-reasons")).toContainText("блокирующие проблемы");
  await expect(page.locator(".plan-item.problem")).toHaveCount(1);
  await snap(page, "03-plan-face-overlap");

  await inspector.getByLabel("Зона").selectOption(away);
  await expect(page.locator('.plan-issues li[data-code="face_overlap"]')).toHaveCount(0);
  await expect(page.getByTestId("zone-plan")).not.toHaveClass(/bad/);
  await page.getByRole("button", { name: "Утвердить визуальный план (B)" }).click();
  await expect(page.getByTestId("approval-B")).toContainText("утверждено");
  await snap(page, "04-plan-zone-fixed-B-approved");

  // стиль: правка → B устарело → перепроверка переносит план на стиль → B снова утверждается
  const planId = (await api<{ plan: { id: string } }>(request, `/api/projects/${projectId}/video`)).plan.id;
  await tab(page, "Стиль");
  await expect(page.getByTestId("style-bible")).toBeVisible();
  const intensity = page.getByLabel("Интенсивность");
  await intensity.selectOption((await intensity.inputValue()) === "calm" ? "energetic" : "calm");
  await expect(page.getByText(/станет устаревшим/)).toBeVisible();
  await snap(page, "05-style-edit-warning");
  await page.getByRole("button", { name: "Сохранить стиль" }).click();
  await expect(page.getByTestId("approval-B")).toContainText("устарело — изменился стиль");
  await expect.poll(async () => (await api<{ inputs_fresh: { style: boolean } }>(request, `/api/plans/${planId}`)).inputs_fresh.style, { timeout: JOB_TIMEOUT }).toBe(true);
  await tab(page, "План");
  await expect(page.getByRole("button", { name: "Утвердить визуальный план (B)" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Утвердить визуальный план (B)" }).click();
  await expect(page.getByTestId("approval-B")).toContainText("утверждено");

  // отклонение вырезки → A и B устарели → баннер → перепроверка (её ставит правка EDL) → сцены
  // пересчитаны. F7 (Task 42): «пересчитана» — только сцена, чьё время изменилось; сцена до
  // восстановленной вырезки без сдвига в changed не входит, и баннер после перепроверки молчит.
  type PlanGet = { inputs_fresh: { edl: boolean }; doc: { items: { id: string; edited: { start_us: number; end_us: number } }[] }; recheck: { changed: { item_id: string; change: string }[] } | null };
  const before = (await api<PlanGet>(request, `/api/plans/${planId}`)).doc.items;
  await tab(page, "Черновой монтаж");
  await page.locator('.cut-row[data-status="accepted"]').first().locator("button[data-action='restore']").click();
  await expect(page.getByTestId("approval-A")).toContainText("устарело");
  await expect(page.getByTestId("approval-B")).toContainText("устарело");
  await tab(page, "План");
  await expect(page.getByTestId("stale-banner")).toBeVisible({ timeout: 30_000 });
  await snap(page, "06-plan-stale-after-cut");
  await expect.poll(async () => (await api<PlanGet>(request, `/api/plans/${planId}`)).inputs_fresh.edl, { timeout: JOB_TIMEOUT }).toBe(true);
  const after = await api<PlanGet>(request, `/api/plans/${planId}`);
  const shifted = after.doc.items.filter((x) => {
    const b = before.find((y) => y.id === x.id);
    return b !== undefined && (b.edited.start_us !== x.edited.start_us || b.edited.end_us !== x.edited.end_us);
  }).map((x) => x.id);
  expect((after.recheck?.changed ?? []).map((c) => c.item_id)).toEqual(shifted);
  if (shifted.length > 0) {
    // форма числа — как в StaleBanner (детерминированно: web/test/video/stale-banner.test.tsx,
    // сдвиг при восстановлении вырезки — server/test/analysis/plan-recheck-f7.test.ts)
    const n = shifted.length;
    const form = n % 10 === 1 && n % 100 !== 11 ? "сцена пересчитана" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "сцены пересчитаны" : "сцен пересчитаны";
    await expect(page.getByTestId("stale-banner")).toContainText(`Монтаж изменился: ${n} ${form}, 0 требуют решения`, { timeout: 30_000 });
  } else {
    await expect(page.getByTestId("stale-banner")).toBeHidden({ timeout: 30_000 });
  }
  await expect(page.getByTestId("b-reasons")).toContainText("черновой монтаж (A)");
  await snap(page, "07-plan-rechecked");
});
