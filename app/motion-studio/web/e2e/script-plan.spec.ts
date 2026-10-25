// UI сценария: вкладки «Текст» и «План» (S8, Step 5) — настоящий сервер на tmp-хранилище, без
// LLM. Dashboard → «Сценарий» → блок текста → «Сохранить» → «Построить план» без агента (пустой
// план) → две сцены выделением мышью → смена приёма → смена скорости чтения (длительность в
// карточке пересчитана). Скриншоты: полные — tmp/ui-e2e/script-full/, 480 px — tmp/e2e-ui/
// script-mvp/ui/{plan,text}.png (MS_WRITE_EVIDENCE=1 — docs/evidence/…).
import { type Locator, type Page, expect, test } from "@playwright/test";
import { scriptShot } from "./helpers.js";

const BLOCK_TITLE = "Блок 1. Три вопроса, которые пережили смену реализации";
const TEXT =
  "Начнём с честной рамки. Несколько лет назад на русскоязычном YouTube вышел, пожалуй, самый известный разбор map в Go, " +
  "и построен он был на трёх вопросах с собеседования. Зачем заранее выделять память под map? Почему порядок обхода случаен? " +
  "И что будет, если писать в map из двух горутин сразу.";
const FIRST = "Начнём с честной рамки";
const SECOND = "Почему порядок обхода случаен";

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();

/**
 * Выделяет фразу в тексте плана, как мышью: диапазон DOM по тексту блока (через подсветки и
 * псевдоэлементы) и `mouseup` — тот же путь, что у выделения человеком.
 */
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

const cards = (page: Page): Locator => page.getByTestId("scene-card");

test("сценарий: текст → план без агента → две сцены выделением → приём → скорость чтения", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  const title = `Сценарий e2e ${Date.now()}`;
  await page.getByLabel("Название проекта").fill(title);
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Текст", exact: true })).toHaveAttribute("aria-selected", "true");

  // текст: блок → счётчик слов → «Сохранить» (ревизия 1)
  const textTab = page.getByTestId("text-tab");
  await textTab.getByLabel("Заголовок блока 1 (необязательно)").fill(BLOCK_TITLE);
  await textTab.getByLabel("Текст блока 1").fill(TEXT);
  await expect(textTab.getByText(/^Всего: \d+ слов/)).toBeVisible();
  await expect(page.getByText("Сначала сохраните текст — план строится по сохранённой версии.")).toBeVisible();
  await textTab.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(textTab.getByText("Сохранено, ревизия 1")).toBeVisible();

  // план без агента (UI-e2e без LLM): пустой план, вкладка «План» открывается сама
  const build = page.getByTestId("build-plan");
  await expect(build.getByRole("checkbox", { name: "С агентом (LLM)" })).toBeChecked();
  await build.getByRole("checkbox", { name: "С агентом (LLM)" }).uncheck();
  await build.getByRole("button", { name: "Построить план" }).click();
  const plan = page.getByTestId("plan-tab");
  await expect(plan).toBeVisible({ timeout: 120_000 });
  await expect(plan.getByText("Ревизия плана 1")).toBeVisible();
  await expect(plan.getByText(/^В плане нет сцен/)).toBeVisible();

  // две сцены выделением: вторая — с выбранным приёмом
  await selectPhrase(page, SECOND);
  const bar = page.getByTestId("selection-bar");
  await expect(bar).toContainText(`«${SECOND}»`);
  await bar.getByLabel("Приём новой сцены").selectOption("kinetic-quote");
  await bar.getByRole("button", { name: "Добавить сцену по выделенному" }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByTestId("selection-bar")).toHaveCount(0);
  await selectPhrase(page, FIRST);
  await page.getByTestId("selection-bar").getByRole("button", { name: "Добавить сцену по выделенному" }).click();
  await expect(cards(page)).toHaveCount(2);
  // карточки — в порядке текста, фрагменты подсвечены и пронумерованы
  await expect(cards(page).nth(0)).toContainText(`«${FIRST}»`);
  await expect(cards(page).nth(0)).toContainText("Сцена 1");
  await expect(cards(page).nth(1)).toContainText(`«${SECOND}»`);
  await expect(cards(page).nth(1).getByLabel("Приём")).toHaveValue("kinetic-quote");
  await expect(page.locator('[data-testid="scene-fragment"][data-n="1"]')).toHaveText(FIRST);
  await expect(page.locator('[data-testid="scene-fragment"][data-n="2"]')).toHaveText(SECOND);
  await expect(plan.getByText("Ревизия плана 3")).toBeVisible();

  // смена приёма у первой сцены
  await cards(page).nth(0).getByLabel("Приём").selectOption("callout-diagram");
  await expect(plan.getByText("Ревизия плана 4")).toBeVisible();
  await expect(cards(page).nth(0).getByLabel("Приём")).toHaveValue("callout-diagram");

  // скорость чтения: 2,5 → 1,5 слова/с — речь в карточке длиннее, запас тот же
  const duration = cards(page).nth(1).locator(".duration");
  const before = await duration.textContent();
  expect(before).toMatch(/^речь [\d,]+ с \+ запас 1,5 с = [\d,]+ с$/);
  const reading = plan.getByRole("form", { name: "Скорость чтения и запас" });
  await reading.getByLabel("Слов в секунду").fill("1,5");
  await reading.getByRole("button", { name: "Применить" }).click();
  await expect(plan.getByText("Ревизия плана 5")).toBeVisible();
  await expect(duration).not.toHaveText(before!);
  const speech = (s: string) => Number(/речь ([\d,]+) с/.exec(s)![1]!.replace(",", "."));
  const after = (await duration.textContent())!;
  expect(after).toMatch(/запас 1,5 с/);
  expect(speech(after)).toBeGreaterThan(speech(before!));
  await expect(reading.getByLabel("Слов в секунду")).toHaveValue("1,5");

  // генерация доступна: блокирующих проблем нет, стиль проекта есть
  await expect(plan.getByRole("button", { name: /^Утвердить и сгенерировать 2 сцены/ })).toBeEnabled();
  await page.mouse.move(0, 0);
  // липкая панель генерации на полном снимке — на своём месте внизу, а не поверх карточек
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await scriptShot(page, "plan");

  // вкладка «Текст»: сохранённый текст с подсветкой сцен плана
  await tab(page, "Текст");
  await expect(page.getByTestId("text-tab").locator('[data-testid="scene-fragment"]')).toHaveCount(2);
  await expect(page.getByTestId("text-tab")).toContainText("Сохранено, ревизия 1");
  await scriptShot(page, "text");
});
