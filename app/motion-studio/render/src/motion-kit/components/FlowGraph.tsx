// Схема-граф: узлы — карточки с глубиной (облик по роли `kind`), рёбра — S-кривые между
// портами. Узлы входят слева направо (у каждого может быть свой вход и кадр), рёбра
// прорисовываются, когда оба конца на месте. До входа (кадр 0) видны силуэты узлов и
// рельсы рёбер — кадр-постер. Дочерние элементы (PulseAlongPath) рисуются в той же системе
// координат над рёбрами; узел вспыхивает в кадр прихода импульса (FlowNode.flash).
import type { Beat, StyleBible } from "@ms/contracts";
import { type CSSProperties, type ReactNode, createContext, useContext, useRef } from "react";
import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { ACCENT_REST, type AccentPulse, accentPulse } from "../choreo/accent.js";
import { type PulseArrival, pathArrivals } from "../choreo/pulse.js";
import { edgeDelay } from "../choreo/rhythm.js";
import { EASE, frames, springAt } from "../easing.js";
import { type CubicSegment, cubicPoint, lutLength, pathD, pathLUT } from "../geometry.js";
import { CLAMP, clamp01, kitWarn, ramp, useSvgId } from "../internal.js";
import { amplitudeOf } from "../style/intensity.js";
import { minTextPx, typeSize } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { type Elevation, accent, alpha, fontFamily, isDark, mix, radius, space, surfaceAt } from "../tokens.js";
import { type CardEnter, cardEnterStyle, cardSurface } from "./Card.js";
import { Halo } from "./Emphasis.js";
import {
  type FlowNodeKind,
  type FlowSlot,
  type FlowStatusSlot,
  TokenBook,
  clientBar,
  edgePath as layoutEdgePath,
  flowLabelZone,
  flowSlot as layoutFlowSlot,
  flowStatusSlot,
  queueCells,
  queueNarrowIssue,
  storeCap,
  usedSides,
} from "./flow-layout.js";

export { type FlowNodeKind, type FlowSlot, type FlowStatusSlot, tokenHeight } from "./flow-layout.js";

/**
 * Порты ребра между узлами графа (как в 0.3): горизонтально (правый край → левый), если узлы
 * разнесены по x хотя бы на 16 px, иначе вертикально (низ → верх).
 */
export const edgePath = (a: FlowNode, b: FlowNode): CubicSegment => layoutEdgePath(a, b);

/** Полоса данных узла графа (как в 0.3, плюс роли queue / store / cache). */
export const flowSlot = (n: FlowNode, s: StyleBible, frameH: number): FlowSlot | null => layoutFlowSlot(n, s, frameH);

export interface FlowNode {
  id: string;
  label: string;
  /** Левый верхний угол и размер, px в системе координат графа. */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Роль узла — свой облик (0.4.0): `service` (карточка, по умолчанию), `queue` (буфер FIFO с
   * ячейками), `store` (цилиндр), `cache` (сетка ячеек, загорается на записи), `client`
   * (окно с панелью), `llm` (ядро-сфера в градиентной кромке). У queue, store и cache полоса
   * данных есть всегда (как `slot`).
   */
  kind?: FlowNodeKind;
  elevation?: Elevation;
  /** Подпись второй строкой (мельче, приглушённо). */
  caption?: string;
  /** Индекс акцента маркера узла (и его вспышки). */
  accentIndex?: number;
  /** Свой вход узла (по умолчанию — `enter` графа): разные входы разделяют роли узлов. */
  enter?: CardEnter;
  /** Кадр входа узла вместо каскада (например, по биту элемента в spec). */
  enterAt?: number;
  /**
   * Вспышка узла: в кадр прихода импульса (`pulseArrival(edgeId, beat, travel)`) или в
   * заданные кадры. Удар accentPulse — ореол, кромка, кольцо, толчок масштаба.
   */
  flash?: PulseArrival | number | (PulseArrival | number)[];
  /**
   * Акцент узла (итог на нём): удар в `start_frame` и дыхание удержания до конца сцены
   * (`loop: false` — гаснет после бита). Тот же accentPulse, что у <Emphasis>; отдельный
   * Emphasis-оверлей поверх или под узлом не нужен.
   */
  emphasis?: Pick<Beat, "start_frame" | "end_frame"> & { loop?: boolean; ring?: "strike" | "every-breath" | false };
  /**
   * Уровень подписи узла: `h2` — герой схемы (крупнее остальных ≥ 1.3×), `body` — по
   * умолчанию, `caption` — служебный узел. Общий кегль подбирается внутри группы одного
   * `size` (самый крупный, при котором каждая подпись группы влезает в свой узел).
   */
  size?: "h2" | "body" | "caption";
  /**
   * Слот данных внизу карточки: подпись поднимается, снизу остаётся место под DataToken
   * кегля caption — токен, пришедший по ребру в этот узел, ложится в слот сам (без `dock`).
   */
  slot?: boolean;
  /** `cache`: кадры записей — на каждой загорается следующая ячейка (по умолчанию — кадры `flash`). */
  writes?: (PulseArrival | number)[];
  /** `cache`: сколько ячеек заполнено с начала. */
  filled?: number;
  /**
   * `queue`: ёмкость буфера — сколько сообщений лежит в нём одновременно (по умолчанию —
   * сколько ячеек влезает по ширине, обычно 2–3). Ячейка DataToken `cell` за ёмкостью — ошибка
   * kit (blocking в QA), не тихое наложение.
   */
  cells?: number;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
}

export interface FlowGraphProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Размер области графа; по умолчанию — по крайним узлам. */
  width?: number;
  height?: number;
  /** Вход узлов по умолчанию (CardEnter): flip; у узла может быть свой `enter`. */
  enter?: CardEnter;
  /**
   * До входа: `silhouette` (по умолчанию) — контуры узлов и пунктир рёбер видны с кадра 0
   * (кадр-постер: схема уже читается, потом оживает); `hidden` — пусто до входа (как в 0.3).
   */
  pre?: "silhouette" | "hidden";
  /** Импульсы и прочие слои поверх рёбер (под карточками). */
  children?: ReactNode;
  /** Слой над карточками: DataToken, влетающий в узел, StatusChip у узла или ребра. */
  overlay?: ReactNode;
}

interface FlowGeometry {
  edges: ReadonlyMap<string, CubicSegment>;
  /** Узлы графа по id (якоря StatusChip / DataToken). */
  nodes: ReadonlyMap<string, FlowNode>;
  /** Концы рёбер по id ребра. */
  links: ReadonlyMap<string, Pick<FlowEdge, "from" | "to">>;
  /** Полосы данных узлов (`slot`, queue / store / cache): куда ложится DataToken. */
  slots: ReadonlyMap<string, FlowSlot>;
  /** То же, что slots (0.4.0): входящий токен ложится сюда; у queue — по ячейкам. */
  inbox: ReadonlyMap<string, FlowSlot>;
  /** Место статуса у каждого узла — снаружи карточки, со стороны без рёбер. */
  status: ReadonlyMap<string, FlowStatusSlot>;
  /** Кадр, когда ребро дорисовано (импульсы раньше не пускать). */
  ready: ReadonlyMap<string, number>;
  /** Кадры прихода импульса (голова касается узла-получателя), по возрастанию. */
  arrivals: (a: PulseArrival) => number[];
  /** Книга токенов графа (S2-fix2): старты и полосы DataToken для правил между токенами. */
  tokens: TokenBook;
}

const FlowContext = createContext<FlowGeometry | null>(null);

/** Геометрия рёбер ближайшего FlowGraph (null вне графа). */
export const useFlowGeometry = () => useContext(FlowContext);

/**
 * Тайминг графа (чистая функция): старты узлов (каскад слева направо в первые ~45 % бита
 * или `enterAt` узла), старты и готовность рёбер, геометрия и приходы импульсов.
 */
export function flowTiming(nodes: FlowNode[], edges: FlowEdge[], beat: Pick<Beat, "start_frame" | "end_frame">, s: StyleBible, fps: number) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const { start_frame: b0, end_frame: b1 } = beat;
  const L = Math.max(1, b1 - b0);
  const order = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y);
  const gap = Math.min(s.motion.stagger_frames * 2.5, (L * 0.45) / Math.max(1, nodes.length - 1));
  const nodeStart = new Map(order.map((n, i) => [n.id, n.enterAt ?? b0 + i * gap + random(`node-${n.id}`) * gap * 0.4]));
  const drawLen = Math.max(1, Math.round(s.motion.enter_frames * 1.1));

  const geo = new Map<string, CubicSegment>();
  const ready = new Map<string, number>();
  const edgeStart = new Map<string, number>();
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    geo.set(e.id, layoutEdgePath(a, b));
    const t0 = Math.max(nodeStart.get(a.id)!, nodeStart.get(b.id)!) + edgeDelay(s);
    edgeStart.set(e.id, t0);
    ready.set(e.id, t0 + drawLen);
  }
  // приход: то же расписание, что у PulseAlongPath (LUT 40, pulsePass, pulseStarts)
  const arrivals = (a: PulseArrival): number[] => {
    const seg = geo.get(a.edgeId);
    return seg ? pathArrivals([seg], a, s, fps, ready.get(a.edgeId)!) : [];
  };
  return { nodeStart, edgeStart, ready, edges: geo, drawLen, arrivals };
}

/**
 * Вспышка узла в кадре `frame` по кадрам прихода `at`: удар accentPulse (без дыхания);
 * при нескольких приходах — самая яркая из идущих вспышек. `emphasis` — акцент узла с
 * дыханием удержания (кольцо — на ударе, на вдохах — при `ring: "every-breath"`); в
 * кадре берётся сильнейшее из акцента и вспышек.
 */
export function nodeFlash(frame: number, s: StyleBible, at: number[], emphasis?: FlowNode["emphasis"]): AccentPulse {
  let best: AccentPulse = ACCENT_REST;
  if (emphasis) {
    const e = accentPulse(frame, s, { beat: emphasis, loop: emphasis.loop ?? true });
    // кольцо удержания — только по ring: every-breath (по умолчанию дыхание без кольца)
    const ring = emphasis.ring ?? "strike";
    best = ring === false || (e.rippleBreath && ring !== "every-breath") ? { ...e, ripple: -1, rippleAlpha: 0, rippleBreath: false } : e;
  }
  for (const t of at) {
    if (t > frame) continue;
    // атака стартует кадром раньше: в сам кадр прихода узел уже загорается
    const p = accentPulse(frame, s, { beat: { start_frame: t - 1, end_frame: t + frames(s, 8) }, loop: false });
    if (p.level > best.level) best = p;
  }
  return best;
}

/** Ширина маркера-точки узла от кегля подписи, px. */
const dotOf = (label: number) => Math.max(10, Math.min(20, Math.round(label * 0.36)));

/**
 * Кегли узлов графа (чистая функция): подпись, пояснение, маркер. Внутри группы одного
 * `size` — общий кегль: самый крупный, при котором каждая подпись группы влезает в свой
 * узел без многоточия (оценка ширины 0.64 em на символ — жирная кириллица шире латиницы), но не крупнее уровня группы
 * (`h2` — не меньше 1.3 × body, `body`, `caption`) и не меньше `minTextPx` (22 px при 1080).
 * Пояснение под подписью — caption шкалы, не крупнее 0.8 подписи (у h2 — 0.6), не мельче предела.
 */
export function flowLabelSizes(nodes: Pick<FlowNode, "id" | "label" | "w" | "size" | "kind">[], s: StyleBible, frameH: number): Map<string, { label: number; caption: number; dot: number }> {
  const padX = space(s, 0.5);
  const body = typeSize(s, "body", frameH);
  const cap = { h2: Math.max(typeSize(s, "h2", frameH), Math.ceil(body * 1.3)), body, caption: typeSize(s, "caption", frameH) };
  const min = minTextPx(frameH);
  const out = new Map<string, { label: number; caption: number; dot: number }>();
  for (const level of ["h2", "body", "caption"] as const) {
    const group = nodes.filter((n) => (n.size ?? "body") === level);
    if (group.length === 0) continue;
    // ширина под текст: поля, маркер (по кеглю уровня) и зазор
    // маркер: точка; у llm — сфера-ядро в 2.4 раза шире
    const fit = group.map((n) => (n.w - 2 * padX - dotOf(cap[level]) * (n.kind === "llm" ? 2.4 : 1) - padX * 0.75) / (Math.max(1, Array.from(n.label).length) * 0.64));
    const label = Math.max(min, Math.floor(Math.min(cap[level], ...fit)));
    const caption = Math.max(min, Math.min(Math.round(typeSize(s, "caption", frameH) * (level === "h2" ? 1.15 : 1)), Math.round(label * (level === "h2" ? 0.6 : 0.8))));
    for (const n of group) out.set(n.id, { label, caption, dot: dotOf(label) });
  }
  return out;
}

/**
 * Сколько ячеек `cache` горит в кадре: `filled` с начала плюс записи до кадра; доля
 * загорания последней 0..1 (пружина записи).
 */
export function cacheFill(frame: number, writes: number[], filled: number, s: StyleBible): { lit: number; last: number } {
  const done = writes.filter((t) => t <= frame).sort((a, b) => a - b);
  const t = done.at(-1);
  return { lit: filled + done.length, last: t === undefined ? 1 : ramp(frame, t, t + frames(s, 8), EASE.outQuart) };
}

export function FlowGraph({ nodes, edges, beat, width, height, enter = "flip", pre = "silhouette", children, overlay }: FlowGraphProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height: frameH } = useVideoConfig();
  const W = width ?? Math.max(...nodes.map((n) => n.x + n.w));
  const H = height ?? Math.max(...nodes.map((n) => n.y + n.h));
  const { nodeStart, edgeStart, ready, edges: geo, drawLen, arrivals } = flowTiming(nodes, edges, beat, s, fps);

  const sizes = flowLabelSizes(nodes, s, frameH);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const links = new Map(edges.map((e) => [e.id, { from: e.from, to: e.to }]));
  const sides = usedSides(nodes, edges);
  const slots = new Map<string, FlowSlot>();
  const status = new Map<string, FlowStatusSlot>();
  for (const n of nodes) {
    status.set(n.id, flowStatusSlot(n, sides.get(n.id)!, s, frameH));
    const slot = layoutFlowSlot(n, s, frameH);
    if (!slot) continue;
    slots.set(n.id, slot);
    if (n.kind === "queue") {
      const narrow = queueNarrowIssue(n.id, slot);
      if (narrow) kitWarn(`queue:${n.id}`, narrow);
    }
    const sz = sizes.get(n.id)!;
    const zone = flowLabelZone(n, s, frameH);
    const text = sz.label * 1.15 + (n.caption ? 4 + sz.caption * 1.2 : 0);
    if (text > zone.h) kitWarn(`slot:${n.id}`, `FlowGraph: узлу "${n.id}" не хватает высоты под подпись и полосу данных (нужно ≥ ${Math.ceil(n.h - zone.h + text)} px, есть ${n.h}) — увеличь h.`);
  }
  const showPre = pre === "silhouette";
  const book = useRef(new TokenBook());

  return (
    <FlowContext.Provider value={{ edges: geo, nodes: nodeMap, links, slots, inbox: slots, status, ready, arrivals, tokens: book.current }}>
      <div style={{ position: "relative", width: W, height: H }}>
        <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {edges.map((e) => {
            const seg = geo.get(e.id);
            if (!seg) return null;
            const t0 = edgeStart.get(e.id)!;
            const p = interpolate(frame, [t0, t0 + drawLen], [0, 1], { ...CLAMP, easing: EASE.outQuart });
            const len = lutLength(pathLUT([seg], 24));
            const end = seg[3];
            const tip = cubicPoint(seg[0], seg[1], seg[2], seg[3], 0.999);
            const ang = (Math.atan2(end.y - tip.y, end.x - tip.x) * 180) / Math.PI;
            const arrow = springAt(frame, fps, s, t0 + drawLen * 0.8, "snappy");
            // рельс до прорисовки: тихий пунктир, гаснет, когда ребро дорисовано
            const rail = showPre ? 1 - p : 0;
            return (
              <g key={e.id}>
                {rail > 0.01 ? <path d={pathD([seg])} fill="none" stroke={alpha(s.palette.muted, 0.3 * rail)} strokeWidth={1.5} strokeLinecap="round" /> : null}
                {/* при p = 0 круглый конец пунктира рисует точку на конце пути — не рисуем */}
                {p > 0 ? (
                  <>
                    <path d={pathD([seg])} fill="none" stroke={alpha(s.palette.text, 0.06)} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - p)} />
                    <path d={pathD([seg])} fill="none" stroke={alpha(s.palette.muted, 0.75)} strokeWidth={2} strokeLinecap="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - p)} />
                    <circle cx={seg[0].x} cy={seg[0].y} r={4 * clamp01(p * 4)} fill={s.palette.muted} />
                    <path
                      d="M -11 -7 L 1 0 L -11 7 Z"
                      fill={s.palette.muted}
                      transform={`translate(${end.x} ${end.y}) rotate(${ang.toFixed(2)}) scale(${Math.max(0, arrow).toFixed(4)})`}
                    />
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>

        {/* силуэты узлов до входа: контур роли без текста — постер кадра 0 */}
        {showPre
          ? nodes.map((n) => {
              const t0 = nodeStart.get(n.id)!;
              // контур гаснет быстро: карточка входит своим движением, двух рамок не видно
              const o = 1 - ramp(frame, t0, t0 + frames(s, 4));
              return o > 0.01 ? <NodeSilhouette key={`pre-${n.id}`} n={n} opacity={o} frameH={frameH} /> : null;
            })
          : null}

        {/* слой импульсов: над рёбрами, под карточками */}
        <div style={{ position: "absolute", inset: 0 }}>{children}</div>

        {nodes.map((n) => {
          const flashAt = n.flash === undefined ? [] : (Array.isArray(n.flash) ? n.flash : [n.flash]).flatMap((f) => (typeof f === "number" ? [f] : arrivals(f)));
          const writes = (n.writes ?? (n.kind === "cache" ? (Array.isArray(n.flash) ? n.flash : n.flash === undefined ? [] : [n.flash]) : [])).flatMap((f) => (typeof f === "number" ? [f] : arrivals(f)));
          return (
            <NodeView
              key={n.id}
              n={n}
              t0={nodeStart.get(n.id)!}
              enter={n.enter ?? enter}
              fl={nodeFlash(frame, s, flashAt, n.emphasis)}
              sz={sizes.get(n.id)!}
              slot={slots.get(n.id)}
              writes={writes}
            />
          );
        })}
        {/* слой над карточками: данные, влетающие в узел, статусы у узлов и рёбер */}
        {overlay ? <div style={{ position: "absolute", inset: 0 }}>{overlay}</div> : null}
      </div>
    </FlowContext.Provider>
  );
}

/** Контур узла до входа: форма роли тонкой линией, без текста (каркас схемы с кадра 0). */
function NodeSilhouette({ n, opacity, frameH }: { n: FlowNode; opacity: number; frameH: number }) {
  const s = useStyle();
  const col = alpha(s.palette.muted, 0.55);
  const box: CSSProperties = { position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, opacity, pointerEvents: "none" };
  if (n.kind === "store") {
    const ry = storeCap(n);
    return (
      <svg style={{ ...box, overflow: "visible" }} width={n.w} height={n.h}>
        <path d={cylinderPath(n.w, n.h, ry)} fill={alpha(s.palette.text, 0.03)} stroke={col} strokeWidth={1.5} />
        <ellipse cx={n.w / 2} cy={ry} rx={n.w / 2} ry={ry} fill="none" stroke={col} strokeWidth={1.5} />
      </svg>
    );
  }
  const r = radius(s, 2);
  return (
    <div style={{ ...box, boxSizing: "border-box", borderRadius: n.kind === "llm" ? r * 1.6 : r, border: `1.5px solid ${col}`, background: alpha(s.palette.text, 0.03) }}>
      {n.kind === "client" ? <div style={{ position: "absolute", left: 0, right: 0, top: clientBar(frameH), borderTop: `1.5px solid ${col}` }} /> : null}
    </div>
  );
}

/** Контур цилиндра w × h с крышкой полуоси ry: бок и нижняя дуга (крышка — отдельным эллипсом). */
function cylinderPath(w: number, h: number, ry: number): string {
  return `M 0 ${ry} L 0 ${h - ry} A ${w / 2} ${ry} 0 0 0 ${w} ${h - ry} L ${w} ${ry} A ${w / 2} ${ry} 0 0 0 0 ${ry} Z`;
}

interface NodeViewProps {
  n: FlowNode;
  t0: number;
  enter: CardEnter;
  fl: AccentPulse;
  sz: { label: number; caption: number; dot: number };
  slot: FlowSlot | undefined;
  writes: number[];
}

/** Узел графа в облике своей роли: карточка / буфер / цилиндр / память / окно / ядро. */
function NodeView({ n, t0, enter, fl, sz, slot, writes }: NodeViewProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height: frameH } = useVideoConfig();
  const gradId = useSvgId(`store-${n.id}`);
  const dark = isDark(s);
  const amp = amplitudeOf(s);
  const kind = n.kind ?? "service";
  const e = n.elevation ?? 2;
  const mark = interpolate(frame, [t0 + frames(s, 8), t0 + frames(s, 22)], [0, 1], { ...CLAMP, easing: EASE.outExpo });
  const col = accent(s, n.accentIndex ?? 0);
  const lit = fl.level > 0.005;
  const surface = cardSurface(s, e);
  const r = kind === "llm" ? Math.round(radius(s, 2) * 1.6) : radius(s, 2);
  const rp = fl.ripple >= 0 ? 1 - (1 - fl.ripple) ** 3 : 0;
  const zone = flowLabelZone(n, s, frameH);
  const padX = space(s, 0.5);
  const flashRing = lit ? `inset 0 0 0 ${(1.5 + 1.5 * fl.strike).toFixed(2)}px ${alpha(col, 0.9 * fl.level)}, 0 0 ${(36 * fl.level).toFixed(1)}px ${alpha(col, (dark ? 0.55 : 0.35) * fl.level)}` : "";
  const enterStyle = cardEnterStyle(s, frame, fps, t0, enter);
  const k = frameH / 1080;

  // поверхность по роли
  let body: ReactNode;
  if (kind === "store") {
    const ry = storeCap(n);
    const top = mix(surfaceAt(s, Math.min(3, e + 1)), s.palette.text, dark ? 0.06 : 0);
    body = (
      <svg width={n.w} height={n.h} style={{ position: "absolute", inset: 0, overflow: "visible", filter: `drop-shadow(0 ${(10 * k).toFixed(1)}px ${(18 * k).toFixed(1)}px ${alpha("#000000", dark ? 0.45 : 0.15)})${lit ? ` drop-shadow(0 0 ${(18 * fl.level).toFixed(1)}px ${alpha(col, 0.6 * fl.level)})` : ""}` }}>
        <defs>
          <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={mix(surfaceAt(s, e), "#000000", dark ? 0.25 : 0.06)} />
            <stop offset="0.45" stopColor={surfaceAt(s, e)} />
            <stop offset="1" stopColor={mix(surfaceAt(s, e), "#000000", dark ? 0.35 : 0.1)} />
          </linearGradient>
        </defs>
        <path d={cylinderPath(n.w, n.h, ry)} fill={`url(#${gradId})`} stroke={lit ? alpha(col, 0.9 * fl.level) : alpha(s.palette.text, dark ? 0.12 : 0.1)} strokeWidth={1.5 + 1.5 * fl.strike} />
        {/* кольцо-пластина под подписью: «диски» хранилища */}
        <path d={`M 0 ${zone.y - n.y + zone.h} A ${n.w / 2} ${ry} 0 0 0 ${n.w} ${zone.y - n.y + zone.h}`} fill="none" stroke={alpha(s.palette.text, dark ? 0.1 : 0.08)} strokeWidth={1.5} />
        <ellipse cx={n.w / 2} cy={ry} rx={n.w / 2 - 0.75} ry={ry - 0.75} fill={top} stroke={alpha(col, 0.55 + 0.4 * fl.level)} strokeWidth={1.5} />
      </svg>
    );
  } else {
    const llmEdge: CSSProperties = kind === "llm"
      ? {
          border: `${Math.max(2, 2 * k).toFixed(1)}px solid transparent`,
          // кромка-градиент акцентов медленно вращается: ядро «думает» и в удержании
          background: `linear-gradient(180deg, ${alpha("#ffffff", dark ? 0.05 : 0.5)} 0%, ${alpha("#ffffff", 0)} 42%) padding-box, linear-gradient(${surfaceAt(s, e)}, ${surfaceAt(s, e)}) padding-box, conic-gradient(from ${((frame * 1.2) % 360).toFixed(1)}deg, ${col}, ${accent(s, (n.accentIndex ?? 0) + 1)}, ${alpha(col, 0.15)}, ${col}) border-box`,

        }
      : {};
    body = (
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxSizing: "border-box",
          ...surface,
          ...llmEdge,
          boxShadow: [flashRing, kind === "llm" ? `inset 0 0 ${(40 * k).toFixed(1)}px ${alpha(col, 0.16)}, 0 0 ${(28 * k).toFixed(1)}px ${alpha(col, 0.14)}` : "", surface.boxShadow].filter(Boolean).join(", "),
          borderRadius: r,
        }}
      >
        {kind === "client" ? (
          // окно устройства: панель с тремя точками и линия под ней
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: clientBar(frameH), borderBottom: `1px solid ${alpha(s.palette.text, dark ? 0.1 : 0.12)}`, display: "flex", alignItems: "center", gap: 6 * k, paddingLeft: 12 * k, boxSizing: "border-box" }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 10 * k, height: 10 * k, borderRadius: 99, background: i === 0 ? alpha(col, 0.95) : alpha(s.palette.muted, 0.5) }} />
            ))}
          </div>
        ) : null}
        {kind === "cache" ? (
          // ножки модуля памяти снизу
          <div style={{ position: "absolute", left: r, right: r, bottom: -7 * k, height: 7 * k, display: "flex", justifyContent: "space-between" }}>
            {Array.from({ length: Math.max(4, Math.floor(n.w / (34 * k))) }, (_, i) => (
              <span key={i} style={{ width: 6 * k, height: "100%", borderRadius: `0 0 ${2 * k}px ${2 * k}px`, background: alpha(s.palette.muted, 0.4) }} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  // маркер: точка; у llm — сфера-ядро
  const DOT = sz.dot;
  const breath = 0.5 + 0.5 * Math.sin((frame / fps) * Math.PI * 0.9);
  const marker = kind === "llm" ? (
    <div
      style={{
        flex: "0 0 auto",
        width: DOT * 2.4,
        height: DOT * 2.4,
        borderRadius: 999,
        background: `radial-gradient(circle at 35% 30%, ${mix(col, "#ffffff", 0.7)} 0%, ${col} 38%, ${mix(col, "#000000", 0.55)} 100%)`,
        boxShadow: `0 0 0 ${(3 + 3 * breath * mark).toFixed(2)}px ${alpha(col, 0.16)}, 0 0 ${(16 + 10 * breath + 14 * fl.level).toFixed(2)}px ${alpha(col, 0.75)}`,
        scale: `${((0.4 + 0.6 * mark) * (1 + 0.25 * fl.strike)).toFixed(4)}`,
      }}
    />
  ) : (
    <div
      style={{
        flex: "0 0 auto",
        width: DOT,
        height: DOT,
        borderRadius: kind === "queue" ? 3 : 999,
        background: lit ? mix(col, "#ffffff", 0.5 * fl.strike) : col,
        boxShadow: `0 0 0 ${(6 * mark + 3 * fl.level).toFixed(2)}px ${alpha(col, 0.18 + 0.1 * fl.level)}, 0 0 ${(18 * mark + 14 * fl.level).toFixed(2)}px ${alpha(col, 0.8)}`,
        scale: `${((0.4 + 0.6 * mark) * (1 + 0.3 * fl.strike)).toFixed(4)}`,
      }}
    />
  );

  // полоса данных по роли: ячейки буфера / сетка памяти / тихая плашка слота
  let band: ReactNode = null;
  if (slot) {
    const bx = slot.x - n.x;
    const by = slot.y - n.y;
    if (kind === "queue") {
      const c = queueCells(slot);
      const chevron = (x: number) => (
        <path d={`M ${x - 5 * k} ${by + slot.h / 2 - 8 * k} L ${x + 3 * k} ${by + slot.h / 2} L ${x - 5 * k} ${by + slot.h / 2 + 8 * k}`} fill="none" stroke={alpha(col, 0.75)} strokeWidth={2.5 * k} strokeLinecap="round" strokeLinejoin="round" />
      );
      band = (
        <svg width={n.w} height={n.h} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: mark }}>
          {Array.from({ length: c.count }, (_, i) => (
            <rect key={i} x={bx + i * (c.w + c.gap)} y={by} width={c.w} height={slot.h} rx={Math.min(8, slot.h * 0.18)} fill={alpha(s.palette.text, dark ? 0.035 : 0.04)} stroke={alpha(s.palette.muted, 0.38)} strokeWidth={1.5} />
          ))}
          {chevron(padX * 0.5 + (bx - padX * 0.5) / 2)}
          {chevron(n.w - (bx - padX * 0.5) / 2 - padX * 0.5)}
        </svg>
      );
    } else if (kind === "cache") {
      const cell = slot.h * 0.42;
      const gap = slot.h * 0.16;
      const cols = Math.max(4, Math.floor((slot.w + gap) / (cell + gap)));
      const f = cacheFill(frame, writes, n.filled ?? 0, s);
      band = (
        <svg width={n.w} height={n.h} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: mark }}>
          {Array.from({ length: cols * 2 }, (_, i) => {
            // заполнение по столбцам слева: ячейка i горит, если записей хватает
            const on = i < f.lit;
            const fresh = i === f.lit - 1 ? f.last : 1;
            const x = bx + Math.floor(i / 2) * (cell + gap) + (slot.w - (cols * (cell + gap) - gap)) / 2;
            const y = by + (i % 2) * (cell + gap) + (slot.h - (2 * cell + gap)) / 2;
            return (
              <rect key={i} x={x} y={y} width={cell} height={cell} rx={cell * 0.22}
                fill={on ? alpha(col, (0.35 + 0.5 * fresh) * (i === f.lit - 1 ? 1 : 0.8)) : alpha(s.palette.text, dark ? 0.04 : 0.05)}
                stroke={on ? alpha(col, 0.9) : alpha(s.palette.muted, 0.3)} strokeWidth={1.2}
                transform={on && i === f.lit - 1 && fresh < 1 ? `translate(${x + cell / 2} ${y + cell / 2}) scale(${(0.6 + 0.4 * fresh).toFixed(4)}) translate(${-x - cell / 2} ${-y - cell / 2})` : undefined} />
            );
          })}
        </svg>
      );
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        left: n.x,
        top: n.y,
        width: n.w,
        height: n.h,
        isolation: "isolate",
        // вспышка: короткий толчок масштаба поверх входа
        transform: fl.scale === 1 ? undefined : `scale(${(1 + (fl.scale - 1) * 0.6).toFixed(5)})`,
      }}
    >
      {lit ? <Halo level={fl.level} color={col} spread={Math.round(Math.min(n.w, n.h) * 0.45)} /> : null}
      {fl.ripple >= 0 ? (
        <div
          style={{
            position: "absolute",
            inset: -(3 + 22 * rp * amp),
            // у цилиндра кольцо — овал по его форме, не прямоугольник
            borderRadius: kind === "store" ? "50% / 26%" : r + 3 + 22 * rp,
            border: `2px solid ${alpha(col, 0.8 * (1 - fl.ripple) * fl.rippleAlpha)}`,
            pointerEvents: "none",
          }}
        />
      ) : null}
      <div style={{ position: "absolute", inset: 0, ...enterStyle }}>
        {body}
        {band}
        <div
          data-ms-layout="label"
          data-ms-id={n.id}
          style={{ position: "absolute", left: zone.x - n.x, top: zone.y - n.y, width: zone.w, height: zone.h, display: "flex", alignItems: "center", gap: padX * 0.75, minWidth: 0 }}
        >
          {marker}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                fontFamily: fontFamily(s.typography.body),
                fontWeight: n.size === "h2" ? 700 : 600,
                fontSize: sz.label,
                lineHeight: 1.15,
                color: s.palette.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {n.label}
            </div>
            {n.caption ? (
              <div style={{ fontFamily: fontFamily(s.typography.mono), fontSize: sz.caption, color: s.palette.muted, whiteSpace: "nowrap", opacity: mark }}>{n.caption}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
