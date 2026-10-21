// Скорость, видимая во времени: дорожки «запрос → ответ» с задержкой в мс. Токен каждой
// дорожки идёт к цели за время, пропорциональное задержке (медленный путь — длинный
// проход, быстрый — короткий), таймер в конце дорожки считает мс в такт полёту, на
// приходе цель вспыхивает. С `repeat` дорожки повторяют проходы до конца бита — за то же
// время быстрая отвечает много раз (счёт «× N» справа), медленная — пару.
import type { Beat, StyleBible } from "@ms/contracts";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_PASS } from "../choreo/pulse.js";
import { EASE, frames, springAt } from "../easing.js";
import { type PluralForms, formatNumber, pluralForm } from "../format.js";
import { clamp01, ramp } from "../internal.js";
import { typeSize } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { accent, alpha, fontFamily, isDark, mix } from "../tokens.js";
import { type StatusTone, toneColor } from "./StatusChip.js";

export interface LatencyLane {
  id: string;
  /** Подпись дорожки («Без кэша», «Из кэша»). */
  label: string;
  /** Задержка, мс: задаёт длительность прохода относительно самой медленной дорожки. */
  ms: number;
  /** Пояснение второй строкой («запрос в БД»). */
  caption?: string;
  /** Тон дорожки: negative — медленный путь, positive — быстрый (по умолчанию accent). */
  tone?: StatusTone;
  accentIndex?: number;
}

export interface LatencyRaceProps {
  /** До входа (0.4.0): `silhouette` (по умолчанию) — тихий контур с кадра 0 (кадр-постер); `hidden` — пусто. */
  pre?: "silhouette" | "hidden";
  lanes: LatencyLane[];
  /** Окно гонки: проходы стартуют с `start_frame`, новые не начинаются после `end_frame`. */
  beat: Pick<Beat, "start_frame" | "end_frame">;
  locale: "ru" | "en";
  /** Кадров на проход самой медленной дорожки (по умолчанию 55 % бита, 24…90). */
  travel?: number;
  /** Самый быстрый проход не короче, кадров (по умолчанию 6). */
  minTravel?: number;
  /** Повторять проходы до конца бита (по умолчанию да). */
  repeat?: boolean;
  /** Счёт ответов под таймером («12 ответов», по умолчанию — при repeat). */
  tally?: boolean;
  /** Формы слова счёта по числу (pluralForm): по умолчанию «ответ / ответа / ответов» (en: response / responses). */
  tallyForms?: PluralForms;
  /** Единица таймера (по умолчанию «мс» / «ms»). */
  unit?: string;
  /** Ширина блока, px (по умолчанию 1280 при 1080p — от высоты кадра). */
  width?: number;
  /** Высота дорожки, px (по умолчанию 150 при 1080p; не меньше подписи с пояснением). */
  laneHeight?: number;
}

export interface LaneTiming {
  /** Кадров на проход. */
  trip: number;
  /** Пауза между проходами, кадров. */
  rest: number;
  starts: number[];
  /** Кадры прихода (start + trip). */
  arrivals: number[];
}

/**
 * Расписание дорожек (чистая функция): проход пропорционален задержке (самая медленная —
 * `travel`, быстрая — не короче `minTravel`), пауза — половина прохода (не меньше 4
 * кадров), с `repeat` проходы идут до конца бита.
 */
export function latencyTiming(lanes: Pick<LatencyLane, "ms">[], beat: Pick<Beat, "start_frame" | "end_frame">, s: StyleBible, o: { travel?: number; minTravel?: number; repeat?: boolean } = {}): LaneTiming[] {
  const L = Math.max(1, beat.end_frame - beat.start_frame);
  const travel = o.travel ?? Math.max(24, Math.min(90, Math.round(L * 0.55)));
  const maxMs = Math.max(1e-9, ...lanes.map((l) => l.ms));
  const minTrip = o.minTravel ?? 6;
  return lanes.map((l) => {
    const trip = Math.max(minTrip, Math.round((travel * l.ms) / maxMs));
    const rest = Math.max(frames(s, 4), Math.round(trip * 0.5));
    const starts: number[] = [];
    for (let t = beat.start_frame; t < beat.end_frame; t += trip + rest) {
      starts.push(t);
      if (o.repeat === false) break;
    }
    return { trip, rest, starts, arrivals: starts.map((t) => t + trip) };
  });
}

export interface LaneFrame {
  phase: "idle" | "flight" | "rest";
  /** Доля пути текущего прохода 0..1 (по кривой прохода). */
  progress: number;
  /** Таймер текущего прохода, мс: растёт линейно со временем, после прихода — итог. */
  elapsedMs: number;
  /** Завершённых проходов. */
  completed: number;
  /** Кадр последнего прихода (null — ещё нет). */
  lastArrival: number | null;
}

/** Дорожка в кадре (чистая функция). */
export function latencyAt(t: LaneTiming, ms: number, frame: number): LaneFrame {
  let i = -1;
  for (let k = 0; k < t.starts.length; k++) if (t.starts[k]! <= frame) i = k;
  const completed = t.arrivals.filter((a) => a <= frame).length;
  const lastArrival = completed > 0 ? t.arrivals[completed - 1]! : null;
  if (i < 0) return { phase: "idle", progress: 0, elapsedMs: 0, completed, lastArrival };
  const u = (frame - t.starts[i]!) / t.trip;
  if (u < 1) return { phase: "flight", progress: EASE_PASS(u), elapsedMs: ms * u, completed, lastArrival };
  return { phase: "rest", progress: 1, elapsedMs: ms, completed, lastArrival };
}

export interface LatencyLayout {
  /** Масштаб от высоты кадра (1080 → 1). */
  k: number;
  width: number;
  laneHeight: number;
  labelW: number;
  timerW: number;
  /** Старт и цель дорожки, px блока. */
  x0: number;
  x1: number;
  /** Толщина трека, радиусы старта, цели и головы токена, зазор до таймера, px. */
  track: number;
  dot: number;
  target: number;
  head: number;
  gap: number;
  /** Кегли: подпись, пояснение, таймер, счёт ответов. */
  body: number;
  caption: number;
  timer: number;
  tally: number;
}

/**
 * Раскладка гонки (чистая функция): вся геометрия — от высоты кадра (при 1080 — как в
 * 0.3.0, на 540p — ровно вдвое меньше), пояснение и счёт — caption шкалы, не мельче.
 */
export function latencyLayout(s: StyleBible, frameH: number, o: { width?: number; laneHeight?: number } = {}): LatencyLayout {
  const k = frameH / 1080;
  const body = typeSize(s, "body", frameH);
  const caption = typeSize(s, "caption", frameH);
  const width = o.width ?? 1280 * k;
  const laneHeight = Math.max(o.laneHeight ?? 150 * k, body * 1.2 + caption * 1.2 + 4 * k);
  const labelW = width * 0.24;
  const timerW = width * 0.2;
  const gap = 28 * k;
  return {
    k,
    width,
    laneHeight,
    labelW,
    timerW,
    x0: labelW + 24 * k,
    x1: width - timerW - gap,
    track: 6 * k,
    dot: 7 * k,
    target: 13 * k,
    head: 9 * k,
    gap,
    body,
    caption,
    timer: Math.round(body * 1.3),
    tally: caption,
  };
}

export interface LaneReadout {
  /** Показывать таймер: с первого кадра движения токена (до него — ни «0 мс»). */
  timer: boolean;
  /** Показывать счёт ответов: с первого прихода (до него — ни «0 ответов»). */
  tally: boolean;
  /** Значение таймера, мс: в первом полёте растёт, дальше держит итог. */
  ms: number;
  /** Первый проход завершён (таймер — цветом тона). */
  done: boolean;
}

/** Что показывает таймер дорожки в кадре (чистая функция). */
export function laneReadout(f: LaneFrame, ms: number): LaneReadout {
  const done = f.completed > 0;
  // таймер — когда токен уже сдвинулся: кадр старта прохода «0 мс» не показывает
  const moving = f.phase === "flight" && f.elapsedMs > 0;
  return { timer: done || moving, tally: done, ms: done ? ms : moving ? f.elapsedMs : 0, done };
}

export function LatencyRace({ lanes, beat, locale, travel, minTravel, repeat = true, tally, tallyForms, unit, width, laneHeight, pre = "silhouette" }: LatencyRaceProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const dark = isDark(s);
  const timing = latencyTiming(lanes, beat, s, { travel, minTravel, repeat });
  const showTally = tally ?? repeat;
  const u = unit ?? (locale === "ru" ? "мс" : "ms");
  const L = latencyLayout(s, height, { width, laneHeight });
  const { k, x0, x1 } = L;
  const W = L.width;
  const LH = L.laneHeight;
  const trackW = x1 - x0;
  const cy = LH / 2;

  return (
    <div style={{ position: "relative", width: W, height: LH * lanes.length }}>
      {lanes.map((lane, i) => {
        const t = timing[i]!;
        const f = latencyAt(t, lane.ms, frame);
        const col = lane.tone ? toneColor(s, lane.tone, lane.accentIndex) : accent(s, lane.accentIndex ?? i);
        // вход дорожки: подъём каскадом, трек прочерчивается
        const enter = springAt(frame, fps, s, beat.start_frame - frames(s, 18) + i * s.motion.stagger_frames * 2, "snappy");
        const draw = ramp(frame, beat.start_frame - frames(s, 14) + i * s.motion.stagger_frames * 2, beat.start_frame, EASE.outQuart);
        const hx = x0 + trackW * f.progress;
        // вспышка цели на приходе
        const since = f.lastArrival === null ? Infinity : frame - f.lastArrival;
        const flash = since < frames(s, 12) ? (1 - since / frames(s, 12)) ** 2 : 0;
        // след токена: длина — скорость (px за кадр), у быстрого — длинный штрих
        const speed = t.trip > 0 ? trackW / t.trip : 0;
        const tail = f.phase === "flight" ? Math.min(trackW * 0.6, Math.max(18 * k, speed * 4)) : 0;
        // таймер — с первого прохода, считает мс только в нём, дальше держит итог (не мигает 0 → N);
        // счёт ответов — с первого прихода: до прохода ни «0 мс», ни «0 ответов»
        const r = laneReadout(f, lane.ms);
        const timerCol = r.done ? col : s.palette.text;
        const ghost = pre !== "hidden" ? 1 - clamp01(enter * 1.5) : 0;
        return (
          <div key={lane.id}>
          {/* силуэт дорожки до входа: пунктир трека и метка цели (кадр-постер) */}
          {ghost > 0.01 ? (
            <svg width={W} height={LH} style={{ position: "absolute", left: 0, top: LH * i, overflow: "visible", opacity: ghost }}>
              <line x1={x0} y1={cy} x2={x1} y2={cy} stroke={alpha(s.palette.text, dark ? 0.2 : 0.18)} strokeWidth={L.track * 0.6} strokeDasharray={`${L.track} ${L.track * 3}`} strokeLinecap="round" />
              <circle cx={x1} cy={cy} r={L.target} fill="none" stroke={alpha(s.palette.text, 0.2)} strokeWidth={1.5 * k} />
            </svg>
          ) : null}
          <div style={{ position: "absolute", left: 0, top: LH * i, width: W, height: LH, opacity: clamp01(enter * 1.5), transform: `translateY(${((1 - Math.min(1, enter)) * 24 * k).toFixed(2)}px)` }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: L.labelW, height: LH, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 * k }}>
              <div style={{ fontFamily: fontFamily(s.typography.body), fontWeight: 600, fontSize: L.body, lineHeight: 1.15, color: s.palette.text, whiteSpace: "nowrap" }}>{lane.label}</div>
              {lane.caption ? <div style={{ fontFamily: fontFamily(s.typography.mono), fontSize: L.caption, lineHeight: 1.15, color: s.palette.muted, whiteSpace: "nowrap" }}>{lane.caption}</div> : null}
            </div>
            <svg width={W} height={LH} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              <line x1={x0} y1={cy} x2={x0 + trackW * draw} y2={cy} stroke={alpha(s.palette.text, dark ? 0.14 : 0.18)} strokeWidth={L.track} strokeLinecap="round" />
              {/* пройденная часть текущего прохода */}
              {f.phase === "flight" ? <line x1={x0} y1={cy} x2={hx} y2={cy} stroke={alpha(col, 0.35)} strokeWidth={L.track} strokeLinecap="round" /> : null}
              {/* старт и цель */}
              <circle cx={x0} cy={cy} r={L.dot * draw} fill={alpha(s.palette.text, 0.5)} />
              <circle cx={x1} cy={cy} r={(L.target + 6 * k * flash) * draw} fill={alpha(col, 0.12 + 0.5 * flash)} stroke={col} strokeWidth={2.5 * k} />
              {flash > 0 ? <circle cx={x1} cy={cy} r={L.target + 30 * k * (1 - flash)} fill="none" stroke={col} strokeWidth={2 * k} opacity={flash} /> : null}
              {f.phase === "flight" ? (
                <g>
                  <line x1={Math.max(x0, hx - tail)} y1={cy} x2={hx} y2={cy} stroke={col} strokeWidth={L.track * 1.67} strokeLinecap="round" opacity={0.45} />
                  <circle cx={hx} cy={cy} r={L.head * 2.4} fill={alpha(col, 0.25)} />
                  <circle cx={hx} cy={cy} r={L.head} fill={mix(col, "#ffffff", 0.6)} />
                </g>
              ) : null}
            </svg>
            <div style={{ position: "absolute", left: x1 + L.gap, top: 0, width: L.timerW, height: LH, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", gap: 2 * k }}>
              <div style={{ fontFamily: fontFamily(s.typography.mono), fontWeight: 700, fontSize: L.timer, lineHeight: 1.1, color: timerCol, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", opacity: r.timer ? 1 : 0, transform: `scale(${(1 + 0.08 * flash).toFixed(4)})`, transformOrigin: "0% 50%", textShadow: flash > 0 ? `0 0 ${(L.body * 0.5).toFixed(1)}px ${alpha(col, 0.6 * flash)}` : undefined }}>
                {formatNumber(Math.round(r.ms), { locale })} {u}
              </div>
              {/* строка счёта занята всегда: таймер не прыгает, когда счёт появляется */}
              {showTally ? (
                <div style={{ marginTop: Math.round(L.timer * 0.18), fontFamily: fontFamily(s.typography.mono), fontSize: L.tally, lineHeight: 1.15, color: s.palette.muted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", opacity: r.tally ? 1 : 0 }}>
                  {formatNumber(f.completed, { locale })}
                  {pluralForm(f.completed, tallyForms ?? (locale === "ru" ? [" ответ", " ответа", " ответов"] : [" response", " responses"]), { locale })}
                </div>
              ) : null}
            </div>
          </div>
          </div>
        );
      })}
    </div>
  );
}
