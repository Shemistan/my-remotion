// Примитивы процесса: смена статуса на месте, данные-объект, скорость во времени.
import { describe, expect, it } from "vitest";
import { laneReadout, latencyAt, latencyLayout, latencyTiming } from "../../src/motion-kit/components/LatencyRace.js";
import { typeSize } from "../../src/motion-kit/style/type-scale.js";
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

describe("latencyLayout / laneReadout (E2.2): кегли не мельче caption, геометрия — от высоты кадра", () => {
  it("подписи и счёт — не мельче caption шкалы; таймер — крупнее body", () => {
    for (const h of [540, 1080, 1920]) {
      const l = latencyLayout(st, h);
      const cap = typeSize(st, "caption", h);
      expect(l.caption).toBeGreaterThanOrEqual(cap);
      expect(l.tally).toBeGreaterThanOrEqual(cap);
      expect(l.timer).toBeGreaterThan(typeSize(st, "body", h));
    }
  });

  it("по умолчанию вся геометрия масштабируется от высоты: 540p — ровно половина 1080p", () => {
    const a = latencyLayout(st, 1080);
    const b = latencyLayout(st, 540);
    for (const key of ["width", "laneHeight", "x0", "x1", "track", "dot", "target", "head", "gap"] as const) {
      expect(b[key], key).toBeCloseTo(a[key] / 2, 0);
    }
  });

  it("заданная ширина — как есть; дорожка вмещает подпись и пояснение", () => {
    const l = latencyLayout(st, 1080, { width: 1600 });
    expect(l.width).toBe(1600);
    expect(l.x1).toBeLessThan(1600);
    expect(l.laneHeight).toBeGreaterThanOrEqual(l.body * 1.2 + l.caption * 1.2);
  });

  it("до первого прохода — ни «0 мс», ни «0 ответов»; счёт — только после первого прихода", () => {
    const [miss] = latencyTiming([{ ms: 120 }], { start_frame: 30, end_frame: 150 }, st, { travel: 60 });
    const idle = laneReadout(latencyAt(miss!, 120, 10), 120);
    expect(idle.timer).toBe(false);
    expect(idle.tally).toBe(false);
    // кадр старта прохода — токен ещё не сдвинулся: «0 мс» не показываем
    expect(laneReadout(latencyAt(miss!, 120, 30), 120).timer).toBe(false);
    const fly = laneReadout(latencyAt(miss!, 120, 60), 120);
    expect(fly.timer).toBe(true);
    expect(fly.tally).toBe(false);
    expect(fly.ms).toBeCloseTo(60, 0);
    const done = laneReadout(latencyAt(miss!, 120, 95), 120);
    expect(done).toMatchObject({ timer: true, tally: true, ms: 120, done: true });
  });
});
