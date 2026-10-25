// S17b: скриншоты Playwright UI по умолчанию — в tmp/e2e-ui/, в docs/evidence/ — только с MS_WRITE_EVIDENCE=1.
import { describe, expect, it } from "vitest";
import { evidenceDirs } from "../e2e/evidence.js";

const REPO = "/repo";

describe("e2e: каталог скриншотов", () => {
  it("по умолчанию — tmp/e2e-ui, evidence в репозитории не трогается", () => {
    for (const v of [undefined, "", "0", "true"]) {
      expect(evidenceDirs(REPO, v)).toEqual({
        root: "/repo/tmp/e2e-ui",
        phase1: "/repo/tmp/e2e-ui/phase-1/ui",
        video: "/repo/tmp/e2e-ui/phase-2/ui",
        phase3: "/repo/tmp/e2e-ui/phase-3/ui",
        script: "/repo/tmp/e2e-ui/script-mvp/ui",
      });
    }
  });

  it("MS_WRITE_EVIDENCE=1 — docs/evidence/<фаза>/ui, как раньше", () => {
    expect(evidenceDirs(REPO, "1")).toEqual({
      root: "/repo/docs/evidence",
      phase1: "/repo/docs/evidence/phase-1/ui",
      video: "/repo/docs/evidence/phase-2/ui",
      phase3: "/repo/docs/evidence/phase-3/ui",
      script: "/repo/docs/evidence/script-mvp/ui",
    });
  });
});
