// Готовность графа (s3afix-rereview, out-of-scope): setup графа не кончается раньше, чем
// дорисованы рёбра — иначе DataToken первой action стартует по недорисованному ребру.
// graphSetupMin — чистый расчёт для планировщика; сверка с расписанием FlowGraph.
import { describe, expect, it } from "vitest";
import { flowTiming } from "../../src/motion-kit/components/FlowGraph.js";
import { graphSetupMin } from "../../src/motion-kit/choreo/graph-timing.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

const chain = (n: number) => ({
  nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `N${i}`, x: i * 220, y: (i % 2) * 120, w: 180, h: 80 })),
  edges: Array.from({ length: n - 1 }, (_, i) => ({ id: `e${i}`, from: `n${i}`, to: `n${i + 1}` })),
});

describe("graphSetupMin", () => {
  it("бит графа длиной graphSetupMin: все рёбра FlowGraph дорисованы к его концу", () => {
    for (const preset of ["dark-premium", "light-clean", "tech-neon"] as const) {
      for (const intensity of ["calm", "balanced", "energetic"] as const) {
        for (const fps of [{ num: 30, den: 1 }, { num: 60, den: 1 }]) {
          const s = resolveStyle({ preset, intensity, fps });
          for (let n = 2; n <= 8; n++) {
            const L = graphSetupMin(s, n);
            const { nodes, edges } = chain(n);
            const t = flowTiming(nodes, edges, { start_frame: 10, end_frame: 10 + L }, s, fps.num);
            const ready = Math.max(...t.ready.values());
            expect(ready, `${preset} ${intensity} ${fps.num} n=${n} L=${L}`).toBeLessThanOrEqual(10 + L);
          }
        }
      }
    }
  });

  it("held-queue (4 узла, 30 fps balanced): setup 0–28 мал — нужно больше, но не больше 3 с", () => {
    const s = resolveStyle({ preset: "dark-premium", intensity: "balanced", fps: { num: 30, den: 1 } });
    const L = graphSetupMin(s, 4);
    expect(L).toBeGreaterThan(28);
    expect(L).toBeLessThanOrEqual(90);
  });
});
