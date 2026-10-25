// Раскладка дорожки плана (Task 33): сцены на оси «после монтажа» → пиксели и номер дорожки.
// Пересекающиеся сцены — на разных дорожках (жадно: первая свободная по порядку начал), стык
// встык — одна дорожка. Порядок результата — как у входа.

export interface TrackItem {
  id: string;
  start_us: number;
  end_us: number;
}

export interface TrackBox {
  id: string;
  left: number;
  width: number;
  lane: number;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

export function trackLayout(items: readonly TrackItem[], durationUs: number, widthPx: number): TrackBox[] {
  const k = durationUs > 0 ? widthPx / durationUs : 0;
  const order = items.map((x, i) => ({ x, i })).sort((a, b) => a.x.start_us - b.x.start_us || a.x.end_us - b.x.end_us || a.i - b.i);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(items.length);
  for (const { x, i } of order) {
    let lane = laneEnds.findIndex((end) => end <= x.start_us);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(x.end_us);
    } else laneEnds[lane] = x.end_us;
    lanes[i] = lane;
  }
  return items.map((x, i) => ({ id: x.id, left: r3(x.start_us * k), width: r3(Math.max(0, x.end_us - x.start_us) * k), lane: lanes[i]! }));
}
