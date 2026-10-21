import { StyleBibleSchema } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { presets } from "../../src/motion-kit/presets.js";
import { contrastRatio } from "../../src/motion-kit/style/contrast.js";

describe("пресеты v0.2", () => {
  it("контраст: текст ≥ 7, приглушённый ≥ 4.5, первый акцент ≥ 3 (бриф)", () => {
    for (const p of Object.values(presets)) {
      expect(contrastRatio(p.palette.text, p.palette.bg), `${p.id} text`).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(p.palette.muted, p.palette.bg), `${p.id} muted`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.palette.accent[0]!, p.palette.bg), `${p.id} accent`).toBeGreaterThanOrEqual(3);
    }
  });

  it("пружина pop с осознанным перелётом: damping 12, stiffness 180, mass 0.8 (ТЗ §8.2)", () => {
    for (const p of Object.values(presets)) {
      expect(p.motion.spring.pop).toEqual({ damping: 12, stiffness: 180, mass: 0.8 });
      expect(StyleBibleSchema.parse(p)).toEqual(p);
    }
  });
});
