// Примитивы процесса: смена статуса на месте, данные-объект, скорость во времени.
import { describe, expect, it } from "vitest";
import { latencyAt, latencyTiming } from "../../src/motion-kit/components/LatencyRace.js";
import { statusAt } from "../../src/motion-kit/components/StatusChip.js";
import { tokenAt } from "../../src/motion-kit/components/DataToken.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

const st = resolveStyle({ preset: "dark-premium", intensity: "balanced" });

describe("statusAt: статусы одного процесса сменяют друг друга в одной точке", () => {
  const states = [
    { text: "Промах", tone: "negative" as const, at: 40 },
    { text: "Запись", at: 70 },
    { text: "Попадание", tone: "positive" as const, at: 100 },
  ];

  it("до первого статуса — ничего; затем ровно один текущий", () => {
    expect(statusAt(states, 39, st)).toBeNull();
    expect(statusAt(states, 40, st)!.current).toBe(0);
    expect(statusAt(states, 69, st)!.current).toBe(0);
    expect(statusAt(states, 85, st)!.current).toBe(1);
    expect(statusAt(states, 300, st)!.current).toBe(2);
  });

  it("смена: прошлый уходит за ~10 кадров (swap 0 → 1), не копится", () => {
    const a = statusAt(states, 70, st)!;
    expect(a.previous).toBe(0);
    expect(a.swap).toBe(0);
    const mid = statusAt(states, 75, st)!;
    expect(mid.swap).toBeGreaterThan(0);
    expect(mid.swap).toBeLessThan(1);
    const done = statusAt(states, 90, st)!;
    expect(done.swap).toBe(1);
    // первый статус входит из ничего
    expect(statusAt(states, 40, st)!.previous).toBeNull();
  });

  it("порядок states не важен — сортировка по at", () => {
    expect(statusAt([...states].reverse(), 85, st)!.current).toBe(1);
  });

  it("until: после него статус уходит", () => {
    expect(statusAt(states, 200, st, 150)!.leave).toBe(1);
    expect(statusAt(states, 140, st, 150)!.leave).toBe(0);
  });
});

describe("latencyTiming: медленный путь — длинный проход, быстрый — короткий", () => {
  const lanes = [
    { id: "miss", label: "Без кэша", ms: 120 },
    { id: "hit", label: "Из кэша", ms: 4 },
  ];
  const beat = { start_frame: 30, end_frame: 150 };

  it("проход пропорционален задержке; самый медленный — travel; быстрый не короче minTravel", () => {
    const t = latencyTiming(lanes, beat, st, { travel: 60 });
    expect(t[0]!.trip).toBe(60);
    expect(t[1]!.trip).toBe(6);
    expect(t[0]!.trip / t[1]!.trip).toBeGreaterThanOrEqual(5);
  });

  it("repeat: за то же время быстрая дорожка приходит много раз, медленная — пару", () => {
    const t = latencyTiming(lanes, beat, st, { travel: 60 });
    expect(t[1]!.arrivals.length).toBeGreaterThanOrEqual(5 * t[0]!.arrivals.length);
    expect(t[0]!.arrivals[0]).toBe(90);
    t.forEach((l) => l.starts.forEach((s0) => expect(s0).toBeLessThan(150)));
  });

  it("без repeat — по одному проходу", () => {
    const t = latencyTiming(lanes, beat, st, { travel: 60, repeat: false });
    expect(t.map((l) => l.arrivals.length)).toEqual([1, 1]);
  });

  it("latencyAt: в полёте таймер растёт с долей времени, после прихода — итог ms и счёт", () => {
    const [miss] = latencyTiming(lanes, beat, st, { travel: 60, repeat: false });
    expect(latencyAt(miss!, 120, 29).phase).toBe("idle");
    const mid = latencyAt(miss!, 120, 60);
    expect(mid.phase).toBe("flight");
    expect(mid.elapsedMs).toBeCloseTo(60, 0);
    const after = latencyAt(miss!, 120, 100);
    expect(after.phase).toBe("rest");
    expect(after.elapsedMs).toBe(120);
    expect(after.completed).toBe(1);
  });
});

describe("tokenAt: данные летят по пути и остаются в узле", () => {
  it("до старта не видно; летит 0 → 1; после прихода — лёг (docked → 1) и остаётся", () => {
    expect(tokenAt(9, 10, 20, st).visible).toBe(false);
    const fly = tokenAt(20, 10, 20, st);
    expect(fly.visible).toBe(true);
    expect(fly.progress).toBeGreaterThan(0);
    expect(fly.progress).toBeLessThan(1);
    expect(tokenAt(30, 10, 20, st).progress).toBe(1);
    expect(tokenAt(200, 10, 20, st).dock).toBe(1);
    expect(tokenAt(200, 10, 20, st).visible).toBe(true);
  });

  it("stay: false — после прихода гаснет; until — уходит", () => {
    expect(tokenAt(200, 10, 20, st, { stay: false }).visible).toBe(false);
    expect(tokenAt(200, 10, 20, st, { until: 100 }).visible).toBe(false);
    expect(tokenAt(90, 10, 20, st, { until: 100 }).visible).toBe(true);
  });
});
