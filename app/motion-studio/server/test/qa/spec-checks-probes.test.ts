// Регрессия ложных blocking specChecks (ревью Fix G, пробы tmp/rr-fixG): валидные spec
// разных доменов не валят сцену; ruling P10 — placeholder_label и purpose_claim только
// warning; accent_conflict blocking — лишь в доказуемом случае (A4: импульс в объект акцента).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Element, type MotionSpec, MotionSpecSchema, type QAIssue, type Settings, SettingsSchema } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { specChecks } from "../../src/qa/spec-checks.js";
import { beat, el, settings, spec } from "./helpers.js";

const s = settings();
/** Реальное разрешение 1920×1080: геометрия рёбер в px кадра задаёт проход импульса kit. */
const hd = settings({ width: 1920, height: 1080 });
const blocking = (sp: MotionSpec, st: Settings = s) => specChecks(sp, st).filter((i) => i.severity === "blocking");
const pick = (sp: MotionSpec, code: string, st: Settings = s) => specChecks(sp, st).filter((i) => i.code === code);
const brief = (l: QAIssue[]) => l.map((i) => `${i.code}/${i.severity}: ${i.description}`);

// ---- пробы tmp/rr-fixG/probe.mts: текст на экране и purpose
const ENTR = ["rise", "fade", "scale", "mask", "slide", "pop", "blur", "draw"] as const;
function textScene(purpose: string, contents: Record<string, unknown>[], kind: Element["kind"] = "text"): MotionSpec {
  const elements = contents.map((c, i) =>
    el(`e${i}`, { kind, entrance: ENTR[i % ENTR.length]!, content: c, layout: { x: 0.05 + (i % 3) * 0.32, y: 0.1 + Math.floor(i / 3) * 0.3, w: 0.28, h: 0.2 } }),
  );
  const sp = spec({ beats: [beat("b0", 0, 60, elements.map((e) => e.id)), beat("b1", 60, 90, [elements[0]!.id], "final-emphasis")] });
  sp.purpose = purpose;
  sp.elements = elements;
  return sp;
}

describe("purpose_claim: кратность в purpose — по границам слов; на экране — весь текст content (ruling P10: warning)", () => {
  const silent: [string, MotionSpec][] = [
    ["PC1 «в 3 разных базах» — не кратность", textScene("Сравнить задержку записи в 3 разных базах данных: Postgres, Mongo, Redis.", [{ text: "Postgres" }, { text: "MongoDB" }, { text: "Redis" }])],
    ["PC2 «последних 5 этапах» — кириллическая х не знак ×", textScene("Показать, как дефекты отлавливаются на последних 5 этапах конвейера.", [{ text: "Сборка" }, { text: "Линт" }, { text: "Тесты" }, { text: "Ревью" }, { text: "Деплой" }])],
    ["PC3 «max 3 retries»", textScene("Explain retry with backoff: max 3 retries before the request fails.", [{ label: "Client" }, { label: "API" }, { text: "Retry 1 · 2 · 3" }])],
    ["PC4 матрица 2×2 — размер, не кратность", textScene("Объяснить матрицу Эйзенхауэра 2×2: срочно/важно.", [{ text: "Срочно и важно" }, { text: "Важно" }, { text: "Срочно" }, { text: "Ни то, ни другое" }])],
    ["PC5 «в 24 раза» = prefix «в » + to + suffix « раза чаще»", textScene("Показать, что микросервисы релизятся в 24 раза чаще монолита.", [{ component: "AnimatedNumber", from: 1, to: 24, prefix: "в ", suffix: " раза чаще" }, { text: "Монолит" }, { text: "Микросервисы" }], "number")],
    ["PC6 «×10» в нестандартном ключе callout", textScene("Show that the cache makes reads ×10 faster.", [{ callout: "×10 faster" }, { label: "Cache" }, { label: "DB" }])],
    ["PC7 «в 10 раз» как suffix × у to = 10", textScene("Кэш ускоряет чтение в 10 раз.", [{ component: "AnimatedNumber", from: 1, to: 10, suffix: "×" }, { label: "Кэш" }, { label: "БД" }], "number")],
    ["PC8 «в десять раз» словами", textScene("Кэш ускоряет чтение в 10 раз.", [{ text: "в десять раз быстрее" }, { label: "Кэш" }, { label: "БД" }])],
    ["PC9 «Linux 6» — x внутри слова", textScene("Show how the Linux 6 kernel schedules tasks across cores.", [{ label: "CFS" }, { label: "Core A" }, { label: "Core B" }])],
    ["PC10 «в 2 раза» как латинское «2x»", textScene("Показать, что новая версия в 2 раза быстрее.", [{ text: "2x быстрее" }, { label: "v1" }, { label: "v2" }])],
    ["PC11 «10 раз быстрее» без «в»", textScene("Кэш ускоряет чтение в 10 раз.", [{ text: "10 раз быстрее" }, { label: "Кэш" }, { label: "БД" }])],
    ["PC12 «в 1,5 раза» как «×1.5»", textScene("Показать, что конверсия выросла в 1,5 раза.", [{ text: "×1.5" }, { label: "До" }, { label: "После" }])],
  ];
  for (const [name, sp] of silent) {
    it(name, () => expect(brief(pick(sp, "purpose_claim"))).toEqual([]));
  }

  it("кратность не видна — warning, не blocking; вдвое/втрое словами в purpose — тоже кратность", () => {
    const sp = textScene("Кэш ускоряет чтение в 10 раз.", [{ label: "Кэш" }, { label: "БД" }]);
    expect(pick(sp, "purpose_claim")).toEqual([expect.objectContaining({ severity: "warning", description: expect.stringContaining("×10") })]);
    expect(pick(textScene("Новый индекс ускоряет поиск втрое.", [{ label: "Индекс" }, { label: "Скан" }]), "purpose_claim")).toEqual([
      expect.objectContaining({ severity: "warning", description: expect.stringContaining("×3") }),
    ]);
    expect(pick(textScene("Новый индекс ускоряет поиск втрое.", [{ label: "Индекс" }, { kicker: "×3 быстрее" }]), "purpose_claim")).toEqual([]);
  });
});

describe("placeholder_label: только родовые слова с номером, не доменная нумерация и не подписи графика (ruling P10: warning)", () => {
  const silent: [string, MotionSpec][] = [
    ["PL1 Raft: Node 1/2/3 — одинаковые реплики", textScene("Explain Raft leader election among three identical replicas.", [{ label: "Node 1" }, { label: "Node 2" }, { label: "Node 3" }], "card")],
    ["PL2 туториал: кикеры «Шаг 1/2/3»", textScene("Показать, как подключить оплату за три шага.", [{ text: "Шаг 1" }, { text: "Шаг 2" }, { text: "Шаг 3" }, { text: "Создай магазин" }, { text: "Получи ключ API" }, { text: "Вставь виджет" }])],
    ["PL3 очередь: Item 1..3", textScene("Explain how a FIFO queue processes items in order.", [{ label: "Item 1" }, { label: "Item 2" }, { label: "Item 3" }], "card")],
    ["PL4 курс: «Модуль 1/2/3» с подписями", textScene("Показать программу курса из трёх модулей.", [{ title: "Модуль 1", caption: "Основы SQL" }, { title: "Модуль 2", caption: "Оконные функции" }, { title: "Модуль 3", caption: "Оптимизация" }], "card")],
    ["PL5 ракета: Stage 1/Stage 2", textScene("Show a two-stage rocket separating.", [{ label: "Stage 1" }, { label: "Stage 2" }, { text: "Separation" }], "card")],
    ["PL6 «Сервер 1/2»", textScene("Балансировщик распределяет запросы.", [{ label: "Сервер 1" }, { label: "Сервер 2" }, { label: "Балансировщик" }], "card")],
    ["PL7 график loss: подписи точек Step 0…3000", textScene("Show training loss dropping as steps increase.", [{ component: "LineChart", points: [{ label: "Step 0", value: 2.3 }, { label: "Step 1000", value: 1.1 }, { label: "Step 2000", value: 0.6 }, { label: "Step 3000", value: 0.4 }] }, { text: "Loss" }, { text: "0.4" }], "chart")],
  ];
  for (const [name, sp] of silent) {
    it(name, () => expect(brief(pick(sp, "placeholder_label"))).toEqual([]));
  }

  it("родовое «Инструмент N» / «Tool N» / «Элемент N» — warning; подписи оси графика не смотрятся", () => {
    const sp = textScene("Агент вызывает инструменты.", [{ label: "Инструмент 1" }, { label: "Tool 2" }, { title: "Элемент 3" }, { component: "BarChart", x_axis: { labels: ["Tool 1", "Tool 2"] } }], "card");
    expect(pick(sp, "placeholder_label")).toEqual([expect.objectContaining({ severity: "warning", area: "e0, e1, e2" })]);
  });
});

// ---- пробы tmp/rr-fixG/probe2.mts: удар акцента посреди полёта импульса
/** Магазин → склад (ребро e1 графа), счётчик приходов `graph.arrivals`; акцент — бит acc 130–160. */
function orders(o: { accent: string; flowsBeat?: string; pulseIds: string[]; action?: string; window?: [number, number]; flow?: Record<string, unknown> }): MotionSpec {
  const [from, to] = o.window ?? [40, 170];
  const sp = spec({
    beats: [
      beat("graph-in", 0, 40, ["graph", "shop", "wh"], "graph-draw"),
      beat("orders", from, to, o.pulseIds, o.action ?? "orders-flow"),
      beat("acc", 130, 160, [o.accent], "final-emphasis"),
      beat("hold", 160, 180, ["graph"], "hold"),
    ],
  });
  const flows = o.flowsBeat ? [{ edge: "e1", direction: "forward", beat: o.flowsBeat, ...(o.flow ?? { count: 6, repeat: true }) }] : [];
  sp.elements = [
    el("graph", { kind: "graph", entrance: "draw", layout: { x: 0.25, y: 0.1, w: 0.5, h: 0.5 }, content: { edges: [{ id: "e1", from: "shop", to: "wh" }], flows } }),
    el("shop", { kind: "card", entrance: "slide", layout: { x: 0.02, y: 0.2, w: 0.2, h: 0.15 }, content: { label: "Магазин" } }),
    el("wh", { kind: "card", entrance: "pop", layout: { x: 0.78, y: 0.2, w: 0.2, h: 0.15 }, content: { label: "Склад" } }),
    el("cnt", { kind: "number", role: "акцент: заказы", entrance: "scale", layout: { x: 0.78, y: 0.7, w: 0.2, h: 0.12 }, content: { component: "AnimatedNumber", bound_to: "graph.arrivals", to: 240 } }),
  ];
  return sp;
}

describe("accent_conflict: валидные spec проб — без blocking", () => {
  const fx = (f: string) => fileURLToPath(new URL(f, import.meta.url));
  const st = SettingsSchema.parse(JSON.parse(readFileSync(fx("../fixtures/specs-run3/settings.json"), "utf8")));
  const gc = MotionSpecSchema.parse(JSON.parse(readFileSync(fx("../../../../../docs/evidence/phase-1/pipeline/gen-compare/spec.json"), "utf8")));
  const stream = (ids: string[]) => {
    const sp = structuredClone(gc);
    sp.beats = sp.beats.map((b) => (b.id === "micro-stream" ? { ...b, action: "micro-release-flow", element_ids: ids } : b));
    return sp;
  };

  it("A1a–c gen-compare прогона 4: поток micro-release-flow и удар героя-счётчика в 126 — не blocking (в т. ч. счётчик в бите потока)", () => {
    expect(brief(blocking(gc, st))).toEqual([]);
    expect(brief(blocking(stream(["pulses-micro"]), st))).toEqual([]);
    expect(brief(blocking(stream(["pulses-micro", "count-micro"]), st))).toEqual([]);
  });

  it("A2 поток заказов 40–170 (count 6, repeat): счётчик приходов бьёт в 130 после первых приходов — не blocking", () => {
    expect(brief(blocking(orders({ accent: "cnt", flowsBeat: "orders", pulseIds: ["graph"] })))).toEqual([]);
    expect(brief(blocking(orders({ accent: "cnt", flowsBeat: "orders", pulseIds: ["graph"] }), hd))).toEqual([]);
  });

  it("A3 источник shop — не назначение: flows привязаны к другому биту (фолбэка на element_ids нет) и привязаны верно", () => {
    expect(brief(blocking(orders({ accent: "shop", flowsBeat: "req", pulseIds: ["shop", "wh"], action: "request-pulse" })))).toEqual([]);
    expect(brief(blocking(orders({ accent: "shop", flowsBeat: "orders", pulseIds: ["graph", "shop", "wh"], action: "request-pulse" })))).toEqual([]);
  });

  it("A5 поток в контейнер lane (group): несвязанная подпись внутри lane — не тот же объект", () => {
    const sp = orders({ accent: "note", flowsBeat: "orders", pulseIds: ["graph", "lane"] });
    sp.elements.push(el("lane", { kind: "group", entrance: "fade", layout: { x: 0.6, y: 0.05, w: 0.4, h: 0.9 } }));
    sp.elements.push(el("note", { kind: "text", role: "акцент: SLA", entrance: "rise", layout: { x: 0.62, y: 0.88, w: 0.3, h: 0.06 }, content: { text: "SLA 99.9 %" } }));
    sp.elements[2] = { ...sp.elements[2]!, layout: { x: 0.62, y: 0.2, w: 0.3, h: 0.15 } };
    sp.elements[0]!.content = { edges: [{ id: "e1", from: "shop", to: "lane" }], flows: [{ edge: "e1", beat: "orders" }] };
    // раскладка пробы задевает граф (overlap) — проверяется только акцент
    expect(brief(blocking(sp).filter((i) => i.code === "accent_conflict"))).toEqual([]);
    expect(pick(sp, "accent_conflict")).toEqual([expect.objectContaining({ severity: "warning", area: "orders, note" })]);
  });
});

describe("accent_conflict: доказуемый случай остаётся blocking", () => {
  it("A4 один импульс 110–150 к wh, акцент wh в 130 — blocking, подсказка — кадр прихода 150", () => {
    const sp = orders({ accent: "wh", flowsBeat: "orders", pulseIds: ["graph"], action: "order-pulse", window: [110, 150], flow: {} });
    expect(blocking(sp)).toEqual([expect.objectContaining({ code: "accent_conflict", area: "orders, wh", fix_hint: expect.stringContaining("150") })]);
  });

  it("A4 поток (count 6, repeat) 110–150 при 1920×1080: первый приход ~179 позже удара 130 — blocking", () => {
    const sp = orders({ accent: "wh", flowsBeat: "orders", pulseIds: ["graph"], action: "order-pulse", window: [110, 150] });
    expect(blocking(sp, hd)).toEqual([expect.objectContaining({ code: "accent_conflict", area: "orders, wh" })]);
  });

  it("поток с travel: удар до первого прихода — blocking, после — нет; без travel и геометрии — только warning", () => {
    const at = (travel: number) => orders({ accent: "wh", flowsBeat: "orders", pulseIds: ["graph"], window: [100, 170], flow: { count: 3, repeat: true, travel } });
    expect(blocking(at(40))).toHaveLength(1); // приход 140 > 130
    expect(blocking(at(25))).toEqual([]); // приход 125 ≤ 130
    const blind = orders({ accent: "wh", flowsBeat: "orders", pulseIds: ["graph"], window: [100, 170] });
    blind.elements = blind.elements.map((e) => (e.id === "shop" || e.id === "wh" ? { ...e, layout: undefined } : e));
    expect(pick(blind, "accent_conflict")).toEqual([expect.objectContaining({ severity: "warning", area: "orders, wh" })]);
  });

  it("«check-in-flow» — импульс, а не вход («in» — слово внутри действия): удар по gate до прихода — blocking", () => {
    const sp = spec({
      beats: [
        beat("hall-in", 0, 30, ["graph", "desk", "gate"], "flowgraph-in"),
        beat("pax", 60, 120, ["graph"], "check-in-flow"),
        beat("boarding", 90, 130, ["gate"], "gate-emphasis"),
      ],
    });
    sp.elements = [
      el("graph", { kind: "graph", entrance: "draw", layout: { x: 0.2, y: 0.1, w: 0.6, h: 0.4 }, content: { edges: [{ id: "e1", from: "desk", to: "gate" }], flows: [{ edge: "e1", beat: "pax" }] } }),
      el("desk", { kind: "card", entrance: "slide", layout: { x: 0.02, y: 0.2, w: 0.15, h: 0.12 }, content: { label: "Стойка регистрации" } }),
      el("gate", { kind: "card", role: "акцент: посадка", entrance: "pop", layout: { x: 0.83, y: 0.2, w: 0.15, h: 0.12 }, content: { label: "Выход B12" } }),
    ];
    expect(blocking(sp)).toEqual([expect.objectContaining({ code: "accent_conflict", area: "pax, gate" })]);
  });
});

describe("валидные spec других доменов — без blocking", () => {
  it("кулинария: «Шаг 1–4» кикерами, «×2» порции на экране, вход разный", () => {
    const sp = textScene("Удвоить рецепт карбонары: все ингредиенты ×2, четыре шага, 15 минут.", [
      { kicker: "Шаг 1", text: "Отварить спагетти" }, { kicker: "Шаг 2", text: "Обжарить гуанчиале" },
      { kicker: "Шаг 3", text: "Смешать желтки и пекорино" }, { kicker: "Шаг 4", text: "Соединить вне огня" },
      { text: "Порции ×2" },
    ]);
    expect(brief(specChecks(sp, s).filter((i) => i.severity === "blocking" || ["placeholder_label", "purpose_claim"].includes(i.code)))).toEqual([]);
  });

  it("финансы: сложный процент «в 10 раз», точки графика «Год 0…30», итог AnimatedNumber «в 10 раз больше»", () => {
    const sp = textScene("Показать, как сложный процент за 30 лет делает вклад в 10 раз больше.", [
      { component: "LineChart", points: [{ label: "Год 0", value: 1 }, { label: "Год 10", value: 2.2 }, { label: "Год 20", value: 4.7 }, { label: "Год 30", value: 10 }] },
      { component: "AnimatedNumber", from: 1, to: 10, prefix: "в ", suffix: " раз больше" },
      { text: "Сложный процент" },
    ], "chart");
    expect(brief(specChecks(sp, s).filter((i) => i.severity === "blocking" || ["placeholder_label", "purpose_claim"].includes(i.code)))).toEqual([]);
  });

  it("спорт: эстафета 4×100 м, «Runner 1–4», передача палочки — удар по runner-2 в кадр прихода", () => {
    const sp = spec({
      beats: [
        beat("track-in", 0, 30, ["graph", "r1", "r2"], "track-draw"),
        beat("baton", 30, 70, ["graph"], "baton-pulse"),
        beat("handoff", 70, 100, ["r2"], "handoff-emphasis"),
        beat("hold", 100, 120, ["graph"], "hold"),
      ],
    });
    sp.purpose = "Explain how a 4×100 m relay hands the baton from runner to runner.";
    sp.elements = [
      el("graph", { kind: "graph", entrance: "draw", layout: { x: 0.25, y: 0.3, w: 0.5, h: 0.3 }, content: { edges: [{ id: "leg1", from: "r1", to: "r2" }], flows: [{ edge: "leg1", beat: "baton", travel: 40 }] } }),
      el("r1", { kind: "card", entrance: "slide", layout: { x: 0.02, y: 0.35, w: 0.2, h: 0.15 }, content: { label: "Runner 1" } }),
      el("r2", { kind: "card", role: "акцент: передача", entrance: "pop", layout: { x: 0.78, y: 0.35, w: 0.2, h: 0.15 }, content: { label: "Runner 2" } }),
    ];
    expect(brief(specChecks(sp, s).filter((i) => i.severity === "blocking" || ["placeholder_label", "purpose_claim", "accent_conflict"].includes(i.code)))).toEqual([]);
  });

  it("логистика 1920×1080: поток посылок в хаб (count 4, repeat, travel 24), счётчик приходов бьёт в 130", () => {
    const sp = orders({ accent: "cnt", flowsBeat: "orders", pulseIds: ["graph"], window: [60, 180], flow: { count: 4, repeat: true, travel: 24 } });
    sp.purpose = "Show parcels streaming into the hub while the arrivals counter climbs.";
    expect(brief(blocking(sp, hd))).toEqual([]);
  });

  it("музыка: «2× tempo» в purpose и подпись «2× tempo» на экране", () => {
    const sp = textScene("Show what a 2× tempo change does to a drum loop.", [{ label: "Kick" }, { label: "Snare" }, { headline: "2× tempo" }]);
    expect(brief(specChecks(sp, s).filter((i) => i.severity === "blocking" || i.code === "purpose_claim"))).toEqual([]);
  });
});
