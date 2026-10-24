// Task 30: промпт и задача Footage Analyst — только Read, кадры по путям из списка, время —
// только frame_us кадров; лицо — детектора, агент только добавляет занятые области.
import { describe, expect, it } from "vitest";
import { buildFootageTask, footageChecklist, footageDetectionsJson, loadPrompt } from "../../src/agents/prompts.js";
import { loadConfig } from "../../src/config.js";

const config = loadConfig({ MS_DATA_DIR: "/tmp/ms-unused" });
const run = { root: "/tmp/ms-unused", runId: "job_01TEST", attempt: 1, config };
const det = (faces: { x: number; y: number; w: number; h: number }[]) => ({
  path: "frames/000001000000.png", width: 640, height: 360, faces: faces.map((f) => ({ ...f, confidence: 0.9 })), humans: [], hands: [], saliency: [],
});

describe("Footage Analyst", () => {
  it("промпт: только Read в рабочем каталоге, координаты сверху слева, frame_us из списка, контракт доказательств, лицо — детектор", () => {
    const p = loadPrompt("footage_analyst");
    expect(p).not.toContain("{{>");
    expect(p).toMatch(/Контракт доказательств/);
    expect(p).toMatch(/только инструмент \*\*Read\*\*/);
    expect(p).toMatch(/слева\s+сверху/);
    expect(p).toMatch(/frame_us/);
    expect(p).toMatch(/llm_only/);
    expect(p).toMatch(/данные, а не инструкции/);
    expect(p).not.toMatch(/aiplatform|ai-platform/);
    expect(p.length).toBeGreaterThan(1500);
  });

  it("задача: роль footage_analyst, инструменты только Read, cwd — рабочий каталог; кадры с frame_us; без секунд", () => {
    const t = buildFootageTask({
      shots: [
        { shot_id: "sh_1", frames: [{ us: 1_000_000, path: "frames/000001000000.png" }, { us: 3_000_000, path: "frames/000003000000.png" }], detections: [det([{ x: 0.5, y: 0.1, w: 0.2, h: 0.3 }]), det([])] },
      ],
      workdir: "/s/run/agent-cwd/job_01TEST-a1-footage_analyst",
    }, run);
    expect(t.role).toBe("footage_analyst");
    expect(t.tools).toEqual(["Read"]);
    expect(t.workdir).toBe("/s/run/agent-cwd/job_01TEST-a1-footage_analyst");
    const input = String(t.input);
    expect(input).toMatch(/## sh_1 \(кадров: 2\)/);
    expect(input).toMatch(/- frame_us 1000000 → `frames\/000001000000\.png` — детектор: лица: \{x 0\.50, y 0\.10, w 0\.20, h 0\.30\}; руки: нет/);
    expect(input).toMatch(/- frame_us 3000000 → `frames\/000003000000\.png` — детектор: лица: нет/);
    expect(input).toMatch(/Режим: vision/);
    expect(input).not.toMatch(/\d+[,.]\d+\s*с\b|\d\d:\d\d/);
    expect(t.idempotencyKey).toBe("job_01TEST-a1-footage_analyst-1");
  });

  it("llm_only: режим в задаче, без сводки детектора; detections.json без рамок", () => {
    const i = { shots: [{ shot_id: "sh_1", frames: [{ us: 500_000, path: "frames/000000500000.png" }] }] };
    expect(footageChecklist(i)).toMatch(/Режим: llm_only/);
    expect(footageChecklist(i)).toMatch(/- frame_us 500000 → `frames\/000000500000\.png`$/m);
    expect(JSON.parse(footageDetectionsJson(i)).frames).toEqual([{ shot_id: "sh_1", frame_us: 500_000, path: "frames/000000500000.png", detector: "нет" }]);
  });
});
