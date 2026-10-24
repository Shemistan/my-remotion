// S11 (находки e2e S5): подсказки Director для сцены сценария — `key_term_early` (раскрытие
// ключевого числа или термина раньше, чем его произносят) и `foreign_label` (подпись-пример
// kit, которой нет ни во фрагменте, ни в идее брифа).
import type { MotionSpec, QAIssue } from "@ms/contracts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { KEY_TERM_TOLERANCE, KIT_EXAMPLE_LABELS, foreignLabelQa, foreignLabels, specChecks } from "../../src/qa/spec-checks.js";
import { settings as makeSettings } from "./helpers.js";

const settings = { ...makeSettings(), duration_frames: 201 };
const codes = (issues: QAIssue[]) => issues.map((i) => i.code);
const of = (issues: QAIssue[], code: string) => issues.filter((i) => i.code === code);

/** Hero-number как в ss_004: счёт до 256 [15; 60), payoff [60; 116), hold до конца. */
function heroSpec(count: [number, number], payoff: [number, number]): MotionSpec {
  return {
    title: "1 к 256", purpose: "ложное совпадение редко", duration_frames: 201, fps: { num: 30, den: 1 }, style_preset: "dark-premium",
    elements: [
      { id: "kicker", kind: "text", role: "label", entrance: "blur", content: { text: "Ложное совпадение tophash" }, layout: { x: 0, y: 0, w: 0.4, h: 0.1 } },
      { id: "num", kind: "number", role: "emphasis", entrance: "count", content: { prefix: "1 к ", from: 1, to: 256 }, layout: { x: 0.5, y: 0.3, w: 0.4, h: 0.3 } },
      { id: "note", kind: "text", role: "label", entrance: "mask", content: { text: "≈ 0,39 % — крайне редко" }, layout: { x: 0, y: 0.7, w: 0.4, h: 0.1 } },
    ],
    phases: [
      { id: "setup", role: "setup", weight: 1, element_ids: ["kicker"] },
      { id: "act", role: "action", weight: 2, element_ids: ["num"] },
      { id: "pay", role: "payoff", weight: 2, element_ids: ["note", "num"] },
      { id: "hold", role: "hold", weight: 2, element_ids: ["num"], hold_mode: "now-pulse" },
    ],
    beats: [
      { id: "b-kicker", phase: "setup", kind: "enter", start_frame: 15, end_frame: count[0], action: "enter", description: "", element_ids: ["kicker"] },
      { id: "b-count", phase: "act", kind: "count", start_frame: count[0], end_frame: count[1], action: "count", description: "", element_ids: ["num"] },
      { id: "b-pay", phase: "pay", kind: "accent", start_frame: payoff[0], end_frame: payoff[1], action: "emphasis", description: "", element_ids: ["note", "num"] },
      { id: "b-hold", phase: "hold", kind: "hold", start_frame: payoff[1], end_frame: 201, action: "hold", description: "", element_ids: ["num"] },
    ],
  };
}

describe("key_term_early", () => {
  const moments = [{ text: "256", value: 256, frame: 140 }];

  it("число досчитано и ударено раньше, чем произнесено — warning с кадром слова", () => {
    const out = of(specChecks(heroSpec([30, 60], [60, 116]), settings, { keyMoments: moments }), "key_term_early");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: "warning", area: "num" });
    expect(out[0]!.description).toContain("140");
    expect(out[0]!.fix_hint).toContain(`${140 - KEY_TERM_TOLERANCE}`);
  });

  it("счёт кончается к слову (допуск −6 кадров), payoff после — без замечания", () => {
    expect(KEY_TERM_TOLERANCE).toBe(6);
    expect(codes(specChecks(heroSpec([40, 134], [134, 171]), settings, { keyMoments: moments }))).not.toContain("key_term_early");
    expect(codes(specChecks(heroSpec([40, 133], [133, 171]), settings, { keyMoments: moments }))).toContain("key_term_early");
  });

  it("термин: акцент на элементе с термином раньше слова — warning; вход в setup — нет", () => {
    const sp = heroSpec([40, 134], [134, 171]);
    expect(codes(specChecks(sp, settings, { keyMoments: [{ text: "tophash", frame: 100 }] }))).not.toContain("key_term_early"); // только вход
    const acc = { ...sp, beats: [...sp.beats, { id: "b-acc", kind: "accent" as const, start_frame: 30, end_frame: 40, action: "emphasis", description: "", element_ids: ["kicker"] }] };
    expect(codes(specChecks(acc, settings, { keyMoments: [{ text: "TopHash", frame: 100 }] }))).toContain("key_term_early");
  });

  it("без моментов — проверки нет; число не на экране — нет замечания", () => {
    expect(codes(specChecks(heroSpec([30, 60], [60, 116]), settings, {}))).not.toContain("key_term_early");
    expect(codes(specChecks(heroSpec([30, 60], [60, 116]), settings, { keyMoments: [{ text: "8", value: 8, frame: 150 }] }))).not.toContain("key_term_early");
  });
});

describe("foreign_label", () => {
  const sourceText = "Массив бакетов удваивался, но не разом: часть записей переезжала из старых бакетов в новые. порциями";
  const withLabels = (labels: string[]): MotionSpec => {
    const sp = heroSpec([40, 134], [134, 171]);
    return { ...sp, elements: [...sp.elements, ...labels.map((label, i) => ({ id: `tok${i}`, kind: "card" as const, role: "token", entrance: "pop" as const, content: { component: "DataToken", label }, layout: { x: 0.5, y: 0.75 + i * 0.01, w: 0.01, h: 0.01 } }))] };
  };

  it("ключ-образец «sku:90» и подпись из примеров kit, которых нет в тексте, — warning", () => {
    const out = of(specChecks(withLabels(["sku:90", "user:17", "Ручной отчёт"]), settings, { sourceText }), "foreign_label");
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("warning");
    expect(out[0]!.description).toContain("«sku:90»");
    expect(out[0]!.description).toContain("«Ручной отчёт»");
    expect(out[0]!.fix_hint).toMatch(/из фразы или идеи/);
  });

  it("подписи из текста и обычные слова — не чужие; без текста — проверки нет", () => {
    expect(codes(specChecks(withLabels(["порциями", "Старые бакеты"]), settings, { sourceText }))).not.toContain("foreign_label");
    expect(codes(specChecks(withLabels(["sku:90"]), settings, {}))).not.toContain("foreign_label");
    expect(foreignLabels(["key:42"], "ключ key:42 в мапе")).toEqual([]);
    expect(foreignLabels(["#17", "sensor:17", "Запрос"], "текст")).toEqual(["#17", "sensor:17", "Запрос"]);
  });

  it("props.json версии (код Engineer): подпись-пример — warning для QA версии", () => {
    const props = { content: { tokens: [{ label: "user:17" }, { label: "старые бакеты" }], title: "Рост порциями" } };
    const out = foreignLabelQa(props, sourceText);
    expect(out).toEqual([expect.objectContaining({ code: "foreign_label", severity: "warning", source: "programmatic" })]);
    expect(out[0]!.description).toContain("«user:17»");
    expect(foreignLabelQa({ content: { label: "старые бакеты" } }, sourceText)).toEqual([]);
  });

  it("список примеров kit взят из refs/motion-kit/API.md", () => {
    const api = readFileSync(fileURLToPath(new URL("../../../render/src/motion-kit/API.md", import.meta.url)), "utf8");
    for (const label of KIT_EXAMPLE_LABELS) expect(api, label).toContain(label);
  });
});
