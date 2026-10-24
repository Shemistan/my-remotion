// Task 30: слияние детектора Vision и наблюдений Footage Analyst.
import { describe, expect, it } from "vitest";
import { type FootageAgentOutput, FootageShotSchema } from "@ms/contracts";
import { type ShotInput, authorPositionFromVision, mergeFootage } from "../../src/analysis/footage-merge.js";
import type { VisionFrame } from "../../src/analysis/vision.js";
import { framesWithFace, framesWithHands } from "./helpers.js";

const face = { x: 0.55, y: 0.15, w: 0.25, h: 0.45 };
const laptop = { x: 0.05, y: 0.55, w: 0.3, h: 0.35 };
const kf = (us: number[]) => us.map((u) => ({ us: u, path: `frames/${String(u).padStart(12, "0")}.png` }));
const shots1: ShotInput[] = [{ id: "sh_1", start_us: 0, end_us: 6_000_000, keyframes: kf([1_000_000, 3_000_000, 5_000_000]) }];
const vision1: Record<string, VisionFrame[]> = { sh_1: framesWithFace(face, 3) };

const agentShot = (over: Partial<FootageAgentOutput["shots"][number]> = {}): FootageAgentOutput["shots"][number] => ({
  shot_id: "sh_1", author_position: "right", motion: "static", gestures: "low", objects: [], background: "стена", notes: "говорит в камеру", uncertainty: [], ...over,
});

describe("mergeFootage", () => {
  it("занято = Vision ∪ важные объекты агента; агент не может удалить лицо; расхождение позиции", () => {
    const merged = mergeFootage(shots1, vision1, { shots: [agentShot({ author_position: "left", objects: [{ kind: "object", label: "ноутбук", frame_us: 1_000_000, rect: laptop, important: true }] })] });
    expect(merged[0]!.occupied).toContainEqual(laptop);
    expect(merged[0]!.uncertainty).toContain("расхождение детектора и агента");
    expect(merged[0]!.occupied).toContainEqual(expect.objectContaining({ x: 0.4875 }));
    expect(merged[0]!.author_position).toBe("right"); // позиция — по детектору
    expect(merged[0]!.face).toEqual({ union: { x: 0.4875, y: 0.0375, w: 0.375, h: 0.675 }, detected_ratio: 1, source: "vision" });
    expect(merged[0]!.notes).toMatch(/детектор: right, агент: left/);
    for (const s of merged) expect(FootageShotSchema.safeParse(s).success).toBe(true);
  });

  it("агент согласен — без пометки; неважный объект не занимает места; свободные зоны по занятому", () => {
    const [s] = mergeFootage(shots1, vision1, { shots: [agentShot({ objects: [{ kind: "object", label: "кружка", frame_us: 3_000_000, rect: laptop, important: false }] })] });
    expect(s!.uncertainty).not.toContain("расхождение детектора и агента");
    expect(s!.occupied).toEqual([{ x: 0.4875, y: 0.0375, w: 0.375, h: 0.675 }]);
    expect(s!.objects).toEqual([{ label: "кружка", rect: laptop, important: false }]);
    expect(s!.free_zones.find((z) => z.zone === "left_third")!.free_ratio).toBe(1);
    expect(s!.motion).toBe("static");
  });

  it("frame_us не из отправленных кадров — объект отброшен с пометкой (агент не выдаёт время)", () => {
    const [s] = mergeFootage(shots1, vision1, { shots: [agentShot({ objects: [{ kind: "object", label: "доска", frame_us: 2_000_000, rect: laptop, important: true }] })] });
    expect(s!.occupied).not.toContainEqual(laptop);
    expect(s!.objects).toEqual([]);
    expect(s!.uncertainty).toContain("агент указал кадр не из списка");
    // отправлен только поднабор кадров — проверяется по нему
    const [t] = mergeFootage(shots1, vision1, { shots: [agentShot({ objects: [{ kind: "object", label: "доска", frame_us: 5_000_000, rect: laptop, important: true }] })] }, { sentUs: { sh_1: [1_000_000, 3_000_000] } });
    expect(t!.objects).toEqual([]);
  });

  it("шот < 3 кадров — «мало кадров»; шот без кадров — нет зон", () => {
    const shots: ShotInput[] = [
      { id: "sh_1", start_us: 0, end_us: 2_000_000, keyframes: kf([500_000, 1_500_000]) },
      { id: "sh_2", start_us: 2_000_000, end_us: 4_000_000, keyframes: [] },
    ];
    const merged = mergeFootage(shots, { sh_1: framesWithFace(face, 2), sh_2: [] });
    expect(merged[0]!.uncertainty).toContain("мало кадров");
    expect(merged[1]!.uncertainty).toContain("нет кадров");
    expect(merged[1]!.free_zones).toEqual([]);
    expect(merged[1]!.face.detected_ratio).toBe(0);
  });

  it("без агента (useAgent: false): движение не оценено, позиция по детектору", () => {
    const [s] = mergeFootage(shots1, vision1);
    expect(s!.author_position).toBe("right");
    expect(s!.uncertainty).toContain("движение камеры не оценено");
    expect(s!.free_zones.map((z) => z.zone)).toEqual(["left_third", "right_third", "top_band", "lower_third"]);
  });

  it("llm_only (нет детектора): лицо — из объекта агента, источник llm, пометка низкой уверенности", () => {
    const faceRect = { x: 0.4, y: 0.1, w: 0.2, h: 0.36 };
    const [s] = mergeFootage(shots1, undefined, { shots: [agentShot({ author_position: "center", objects: [
      { kind: "face", label: "лицо", frame_us: 1_000_000, rect: faceRect, important: true },
      { kind: "face", label: "лицо", frame_us: 3_000_000, rect: faceRect, important: true },
    ] })] });
    const grown = { x: 0.35, y: 0.01, w: 0.3, h: 0.54 }; // +25 % размера с каждой стороны, как у детектора
    expect(s!.face.source).toBe("llm");
    expect(s!.face.union).toEqual(grown);
    expect(s!.face.detected_ratio).toBeCloseTo(2 / 3, 9);
    expect(s!.occupied).toEqual([grown]);
    expect(s!.uncertainty).toContain("низкая уверенность зон: нет детектора Vision");
    expect(s!.uncertainty).not.toContain("лицо найдено менее чем на 30 % кадров");
    expect(s!.author_position).toBe("center");
  });

  it("ревью Task 30, I1: llm_only — лицо агента расширено на faceMargin и занято, даже если important: false", () => {
    const faceR = { x: 0.55, y: 0.15, w: 0.25, h: 0.45 };
    const [a] = mergeFootage(shots1, undefined, { shots: [agentShot({ objects: [{ kind: "face", label: "лицо", frame_us: 1_000_000, rect: faceR, important: true }] })] });
    expect(a!.occupied).toEqual([{ x: 0.4875, y: 0.0375, w: 0.375, h: 0.675 }]);
    expect(a!.free_zones.find((z) => z.zone === "right_third")!.free_ratio).toBeLessThan(0.75);
    const [b] = mergeFootage(shots1, undefined, { shots: [agentShot({ objects: [{ kind: "face", label: "Лицо автора", frame_us: 1_000_000, rect: faceR, important: false }] })] });
    expect(b!.occupied).toEqual([{ x: 0.4875, y: 0.0375, w: 0.375, h: 0.675 }]);
    // поле — из настроек (planning.faceMargin)
    const [c] = mergeFootage(shots1, undefined, { shots: [agentShot({ objects: [{ kind: "face", label: "лицо", frame_us: 1_000_000, rect: faceR, important: true }] })] }, { faceMargin: 0 });
    expect(c!.occupied).toEqual([faceR]);
  });

  it("ревью Task 30, I1: llm_only — лицо на 1 кадре из 10 → пометка «лицо найдено менее чем на 30 % кадров»; руки агента — с полем рук", () => {
    const ten: ShotInput[] = [{ id: "sh_1", start_us: 0, end_us: 20_000_000, keyframes: kf(Array.from({ length: 10 }, (_, k) => 1_000_000 + k * 2_000_000)) }];
    const faceR = { x: 0.4, y: 0.1, w: 0.2, h: 0.3 };
    const hand = { x: 0.3, y: 0.6, w: 0.2, h: 0.2 };
    const [s] = mergeFootage(ten, undefined, { shots: [agentShot({ objects: [
      { kind: "face", label: "лицо", frame_us: 1_000_000, rect: faceR, important: true },
      { kind: "hands", label: "руки", frame_us: 3_000_000, rect: hand, important: false },
    ] })] });
    expect(s!.face.detected_ratio).toBeCloseTo(0.1, 9);
    expect(s!.uncertainty).toContain("лицо найдено менее чем на 30 % кадров");
    expect(s!.hands).toEqual({ union: { x: 0.28, y: 0.58, w: 0.24, h: 0.24 }, detected_ratio: 0.1 });
    expect(s!.occupied).toContainEqual({ x: 0.28, y: 0.58, w: 0.24, h: 0.24 });
    // доля — от отправленных агенту кадров шота
    const [t] = mergeFootage(ten, undefined, { shots: [agentShot({ objects: [{ kind: "face", label: "лицо", frame_us: 1_000_000, rect: faceR, important: true }] })] }, { sentUs: { sh_1: [1_000_000, 3_000_000] } });
    expect(t!.face.detected_ratio).toBe(0.5);
    expect(t!.uncertainty).not.toContain("лицо найдено менее чем на 30 % кадров");
  });

  it("с детектором объект-лицо агента — обычный объект: лицо по Vision, важный — занят как объект", () => {
    const [s] = mergeFootage(shots1, vision1, { shots: [agentShot({ objects: [{ kind: "face", label: "лицо", frame_us: 1_000_000, rect: laptop, important: true }] })] });
    expect(s!.face.source).toBe("vision");
    expect(s!.face.union).toEqual({ x: 0.4875, y: 0.0375, w: 0.375, h: 0.675 });
    expect(s!.occupied).toContainEqual(laptop);
  });

  it("ревью Task 30, m3: важный объект больше 60 % кадра — пометка (занятость не снимается)", () => {
    const big = { x: 0, y: 0, w: 0.9, h: 0.9 };
    const [s] = mergeFootage(shots1, vision1, { shots: [agentShot({ objects: [{ kind: "object", label: "экран", frame_us: 1_000_000, rect: big, important: true }] })] });
    expect(s!.uncertainty).toContain("агент отметил важным объект больше 60 % кадра");
    expect(s!.occupied).toContainEqual(big);
    const [t] = mergeFootage(shots1, vision1, { shots: [agentShot({ objects: [{ kind: "object", label: "стена", frame_us: 1_000_000, rect: big, important: false }] })] });
    expect(t!.uncertainty).not.toContain("агент отметил важным объект больше 60 % кадра");
  });

  it("ревью Task 30, m7: кадр, который детектор не прочитал, не считается кадром без лица", () => {
    const frames = framesWithFace(face, 3);
    frames[1] = { ...frames[1]!, faces: [], error: "не читается как изображение" };
    const [s] = mergeFootage(shots1, { sh_1: frames });
    expect(s!.face.detected_ratio).toBe(1);
    expect(s!.uncertainty).toContain("детектор не прочитал кадр");
  });

  it("llm_only без ответа агента — зоны не оцениваются (не «всё свободно»)", () => {
    const [s] = mergeFootage(shots1, undefined);
    expect(s!.free_zones).toEqual([]);
    expect(s!.author_position).toBe("absent");
    expect(s!.uncertainty).toContain("нет данных о кадре: ни детектора, ни агента");
  });

  it("руки без лица: позиция «absent» по детектору, руки заняты", () => {
    const [s] = mergeFootage(shots1, { sh_1: framesWithHands({ x: 0.3, y: 0.6, w: 0.2, h: 0.2 }, 3) });
    expect(s!.author_position).toBe("absent");
    expect(s!.hands.detected_ratio).toBe(1);
    expect(s!.occupied).toEqual([{ x: 0.28, y: 0.58, w: 0.24, h: 0.24 }]);
  });

  it("агент пропустил шот или назвал несуществующий — шот без наблюдений агента, лишнее игнорируется", () => {
    const merged = mergeFootage(shots1, vision1, { shots: [agentShot({ shot_id: "sh_9" })] });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.uncertainty).toContain("агент не описал шот");
  });
});

describe("authorPositionFromVision", () => {
  it("лево/центр/право/нет/смешано по центрам лиц", () => {
    expect(authorPositionFromVision(framesWithFace({ x: 0.05, y: 0.2, w: 0.2, h: 0.3 }, 3))).toBe("left");
    expect(authorPositionFromVision(framesWithFace({ x: 0.4, y: 0.2, w: 0.2, h: 0.3 }, 3))).toBe("center");
    expect(authorPositionFromVision(framesWithFace(face, 3))).toBe("right");
    expect(authorPositionFromVision(framesWithFace(face, 0, { total: 3 }))).toBe("absent");
    expect(authorPositionFromVision([...framesWithFace({ x: 0.05, y: 0.2, w: 0.2, h: 0.3 }, 2), ...framesWithFace(face, 2)])).toBe("mixed");
  });
});
