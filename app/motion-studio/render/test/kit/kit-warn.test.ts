// Тихие фолбэки kit (E2.5): неверное использование примитива видно в консоли рендера
// (`[error] [motion-kit] …` — его подхватывает QA как console_error), а не молча даёт ноль.
import { afterEach, describe, expect, it, vi } from "vitest";
import { kitWarn } from "../../src/motion-kit/internal.js";
import { arrivalSourceIssue } from "../../src/motion-kit/components/PulseAlongPath.js";
import { statusAnchorIssue } from "../../src/motion-kit/components/StatusChip.js";
import { edgeSegment } from "../../src/motion-kit/geometry.js";

const flow = {
  edges: new Map([["e-req", edgeSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, "h")]]),
  nodes: new Map([["cache", { id: "cache", label: "Кэш", x: 0, y: 0, w: 100, h: 50 }]]),
};

afterEach(() => vi.restoreAllMocks());

describe("kitWarn: одно сообщение на ключ, с префиксом [motion-kit]", () => {
  it("пишет в console.error один раз на ключ", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    kitWarn("test-key-1", "что-то не так");
    kitWarn("test-key-1", "что-то не так");
    kitWarn("test-key-2", "другое");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]![0]).toBe("[motion-kit] что-то не так");
  });
});

describe("arrivalSourceIssue: useArrivalCount по ребру вне FlowGraph", () => {
  const a = { edgeId: "e-req", beat: { start_frame: 10, end_frame: 50 }, travel: 10 };
  it("pulseArrival вне графа — сообщение; свои segments вне графа — норма", () => {
    expect(arrivalSourceIssue(a, null)).toMatch(/вне <FlowGraph>/);
    expect(arrivalSourceIssue({ segments: [flow.edges.get("e-req")!], beat: a.beat, travel: 10 }, null)).toBeNull();
  });
  it("в графе: известное ребро — норма, неизвестное — сообщение", () => {
    expect(arrivalSourceIssue(a, flow)).toBeNull();
    expect(arrivalSourceIssue({ ...a, edgeId: "e-x" }, flow)).toMatch(/e-x/);
  });
});

describe("statusAnchorIssue: якорь StatusChip вне графа или мимо узла / ребра", () => {
  it("без якоря — норма (x / y); якорь вне графа — сообщение", () => {
    expect(statusAnchorIssue(undefined, null)).toBeNull();
    expect(statusAnchorIssue({ node: "cache" }, null)).toMatch(/вне <FlowGraph>/);
  });
  it("в графе: есть узел / ребро — норма; нет — сообщение с id", () => {
    expect(statusAnchorIssue({ node: "cache" }, flow)).toBeNull();
    expect(statusAnchorIssue({ edge: "e-req" }, flow)).toBeNull();
    expect(statusAnchorIssue({ node: "db" }, flow)).toMatch(/db/);
    expect(statusAnchorIssue({ edge: "e-db" }, flow)).toMatch(/e-db/);
  });
});
