// S14: «иллюстрированные подписи» смоука блока 1 на уровне spec — пустые карточки-заглушки
// (ss_001: три карточки «?»), повтор общей подписи без числа и сущности (ss_005: узлы
// «вопрос» ×3). Подсказки Director (сцене сценария — повод для раунда, `scriptRedo`).
import type { Element, MotionSpec, QAIssue } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { specChecks } from "../../src/qa/spec-checks.js";
import { settings as makeSettings } from "./helpers.js";

const settings = { ...makeSettings(), duration_frames: 150 };
const of = (issues: QAIssue[], code: string) => issues.filter((i) => i.code === code);

function spec(elements: Element[]): MotionSpec {
  return {
    title: "Сцена", purpose: "мысль", duration_frames: 150, fps: { num: 30, den: 1 }, style_preset: "dark-premium",
    elements: [{ id: "hero", kind: "number", role: "emphasis", entrance: "count", content: { to: 3 } }, ...elements],
    beats: [
      { id: "b-in", start_frame: 0, end_frame: 30, action: "enter", kind: "enter", description: "", element_ids: elements.map((e) => e.id) },
      { id: "b-acc", start_frame: 60, end_frame: 90, action: "emphasis", kind: "accent", description: "", element_ids: ["hero"] },
      { id: "b-hold", start_frame: 90, end_frame: 150, action: "hold", kind: "hold", description: "", element_ids: ["hero"] },
    ],
  };
}

describe("placeholder_label: повтор общей подписи и знак вместо содержимого", () => {
  it("узлы «вопрос» ×3 (ss_005) — warning с подписью и числом повторов", () => {
    const nodes = ["q1", "q2", "q3"].map((id) => ({ id, kind: "card" as const, role: "node", entrance: "rise" as const, content: { label: "вопрос", kind: "service" } }));
    const hit = of(specChecks(spec(nodes), settings), "placeholder_label");
    expect(hit).toHaveLength(1);
    expect(hit[0]!.description).toMatch(/«вопрос» ×3/);
    expect(hit[0]!.area).toBe("q1, q2, q3");
  });

  it("подписи узлов одного графа (content.nodes) — тоже", () => {
    const g = { id: "graph", kind: "graph" as const, role: "схема", entrance: "draw" as const, content: { nodes: [{ id: "a", label: "Этап" }, { id: "b", label: "Этап" }, { id: "c", label: "этап" }], edges: [] } };
    expect(of(specChecks(spec([g]), settings), "placeholder_label")).toHaveLength(1);
  });

  it("знак вместо подписи («?», «…») — warning", () => {
    const cards = { id: "cards", kind: "group" as const, role: "карточки", entrance: "rise" as const, content: { component: "Card", count: 3, glyph: "?" } };
    const hit = of(specChecks(spec([cards]), settings), "placeholder_label");
    expect(hit).toHaveLength(1);
    expect(hit[0]!.description).toMatch(/«\?»/);
  });

  it("разные подписи, повтор с числом («Шаг 1», «Шаг 2») и два одинаковых статуса — норма", () => {
    const ok = [
      { id: "a", kind: "card" as const, role: "node", entrance: "rise" as const, content: { label: "Память под map" } },
      { id: "b", kind: "card" as const, role: "node", entrance: "rise" as const, content: { label: "Порядок обхода" } },
      { id: "s1", kind: "text" as const, role: "label", entrance: "fade" as const, content: { text: "Шаг 1" } },
      { id: "s2", kind: "text" as const, role: "label", entrance: "fade" as const, content: { text: "Шаг 1" } },
      { id: "s3", kind: "text" as const, role: "label", entrance: "fade" as const, content: { text: "Шаг 1" } },
      { id: "c1", kind: "shape" as const, role: "статус", entrance: "pop" as const, content: { text: "актуален" } },
      { id: "c2", kind: "shape" as const, role: "статус", entrance: "pop" as const, content: { text: "актуален" } },
    ];
    expect(of(specChecks(spec(ok), settings), "placeholder_label")).toEqual([]);
  });
});

describe("empty_container: пустой контейнер в spec", () => {
  it("content.empty и роль «пустые карточки» (ss_001) — warning", () => {
    const cards = { id: "question-cards", kind: "group" as const, role: "три пустые карточки-вопроса", entrance: "rise" as const, content: { component: "Card", count: 3, empty: true } };
    const hit = of(specChecks(spec([cards]), settings), "empty_container");
    expect(hit).toHaveLength(1);
    expect(hit[0]!.area).toBe("question-cards");
    expect(hit[0]!.severity).toBe("warning");
  });

  it("карточка с подписью — норма", () => {
    const card = { id: "c", kind: "card" as const, role: "карточка", entrance: "rise" as const, content: { label: "Swiss Table" } };
    expect(of(specChecks(spec([card]), settings), "empty_container")).toEqual([]);
  });
});

describe("timeline_single_event (S15a): таймлайн из одной вехи", () => {
  const tl = (items: unknown[]) => ({ id: "timeline", kind: "chart" as const, role: "герой: ось времени", entrance: "draw" as const, content: { component: "Timeline", orientation: "h", items } });
  it("одна веха (смоук S14, сц. 4: ось 2024–2027 ради «февраль 2025») — warning с подсказкой сменить приём", () => {
    const hit = of(specChecks(spec([tl([{ date: "февраль 2025", label: "релиз" }])]), settings), "timeline_single_event");
    expect(hit).toHaveLength(1);
    expect(hit[0]!.severity).toBe("warning");
    expect(hit[0]!.area).toBe("timeline");
    expect(hit[0]!.fix_hint).toMatch(/при[её]м/);
  });
  it("две вехи и больше — норма", () => {
    expect(of(specChecks(spec([tl([{ date: "2019", label: "a" }, { date: "2025", label: "b" }])]), settings), "timeline_single_event")).toEqual([]);
  });
});
