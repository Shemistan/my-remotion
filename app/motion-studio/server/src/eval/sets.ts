// Наборы запросов eval (`scripts/EVAL.md`). `explainer` — основной набор качества: его средние
// и правило приёмки `--compare`. `user` — отдельный постоянный набор пользователя
// (иллюстративная нарративная анимация, `user-cases.ts`): базовая линия на каждую веху качества,
// информативно — рубрика судьи написана под продуктовый explainer.
import { USER_CASES } from "./user-cases.js";

export const SET_NAMES = ["explainer", "user"] as const;
export type SetName = (typeof SET_NAMES)[number];

/**
 * Набор explainer: 7 запросов, на которых шла настройка (Test 1/2, обобщение, первые отложенные), и 5
 * новых отложенных (`eval-*`) — заморожены, промпты по ним не настраиваются.
 */
export const EXPLAINER_SET: Readonly<Record<string, string>> = {
  test1: "Создай премиальную анимацию роста пользователей с 10 000 до 1 000 000 за три года. Тёмный фон, крупная типографика, плавное движение графика, акцент на конечном значении",
  test2: "Покажи архитектуру AI-агента: пользователь отправляет запрос, оркестратор вызывает три инструмента, данные возвращаются обратно. Световые импульсы движутся по связям",
  "gen-compare": "Сравни монолит и микросервисы по скорости релизов",
  "gen-timeline": "Таймлайн развития компании 2015–2025 с пятью вехами",
  "gen-cache": "Объясни, как работает кэширование: запрос, промах, запись, попадание",
  "held-mobile": "Покажи, как растёт доля мобильного трафика: 2019 — 35%, 2024 — 68%",
  "held-queue": "Объясни, как работает очередь сообщений между сервисом заказов и складом",
  "eval-funnel": "Покажи воронку интернет-магазина: из 100 посетителей до покупки доходят только 3",
  "eval-oauth": "Объясни вход через OAuth: пользователь, приложение, сервер авторизации и токен доступа",
  "eval-cdn": "Сравни задержку загрузки для пользователя из Москвы: сервер во Франкфурте — 180 мс, CDN-узел в Москве — 15 мс",
  "eval-budget": "Как распределяется месячный бюджет семьи: жильё 35%, еда 25%, транспорт 15%, развлечения 10%, накопления 15%",
  "eval-abtest": "Итог A/B-теста новой кнопки оформления заказа: конверсия выросла с 5,0% до 5,6% — плюс 12%",
};
export const HELD_OUT: ReadonlySet<string> = new Set(Object.keys(EXPLAINER_SET).filter((s) => s.startsWith("eval-")));

/**
 * Длина сцен набора user: 60 с при 30 fps — верх диапазона 20–60 с из кейсов. Контракт
 * (`duration_frames`) потолка не задаёт; практический предел — таймаут рендера превью в fix-loop.
 */
export const USER_DURATION_FRAMES = 1800;

export interface SetItem {
  id: string;
  /** Имя запроса (для leave-one-scene-out калибровки). */
  scene: string;
  prompt: string;
  /** Длина сцены вместо `defaultSettings().duration_frames`; нет — по умолчанию. */
  duration_frames?: number;
}

export function parseSetName(v: string | undefined): SetName {
  if (v === undefined) return "explainer";
  if (!(SET_NAMES as readonly string[]).includes(v)) throw new Error(`--set: ${SET_NAMES.join(", ")}; получено ${v}`);
  return v as SetName;
}

/** Сцены набора (с фильтром `--only`); фильтр без совпадений в наборе — ошибка. */
export function setItems(set: SetName, only?: readonly string[]): SetItem[] {
  const all: SetItem[] = set === "user"
    ? USER_CASES.map((c) => ({ id: c.id, scene: c.id, prompt: c.prompt, duration_frames: USER_DURATION_FRAMES }))
    : Object.entries(EXPLAINER_SET).map(([scene, prompt]) => ({ id: scene, scene, prompt }));
  if (!only) return all;
  const unknown = only.filter((o) => !all.some((i) => i.id === o));
  if (unknown.length > 0) throw new Error(`--only: нет таких сцен в наборе ${set}: ${unknown.join(", ")}`);
  return all.filter((i) => only.includes(i.id));
}
