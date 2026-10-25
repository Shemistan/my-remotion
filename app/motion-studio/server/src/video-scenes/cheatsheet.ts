// Шпаргалка папки клипов видеопроекта (Task 5L, Phase 5-lite): по строке на сцену плана —
// где клип стоит в смонтированном ролике и где тот же кусок в исходнике (ЧЧ:ММ:СС:КК), длительность
// файла, фраза, режим/зона, утверждена ли (C), короткие замечания (F8). Сцены, которые не вошли, —
// на своём месте с причиной. Форматы как у сценария: md (таблица клипов + «Не вошли»), csv (UTF-8
// BOM, «;»), txt (строка на сцену).
import { type Fps, type PlannedCompositionMode, type VideoPackageManifest, type Zone, usToFrame, usToFrameCeil } from "@ms/contracts";
import { type CheatFormat, cheatNotes, csvField, mdRow, oneLine } from "../script/cheatsheet.js";
import { sceneNumber } from "../script/package-names.js";

/** Режим размещения для человека (как в UI плана, но про монтаж). */
export const MODE_RU: Record<PlannedCompositionMode, string> = {
  fullscreen: "на весь кадр",
  overlay: "поверх видео",
  split_screen: "разделённый экран",
  pip: "окно в кадре",
  callout: "выноска",
};

export const ZONE_RU: Record<Zone, string> = {
  left_third: "левая треть",
  right_third: "правая треть",
  top_band: "полоса сверху",
  lower_third: "нижняя треть",
  full: "весь кадр",
  split_left: "левая половина",
  split_right: "правая половина",
  pip_tl: "окно слева сверху",
  pip_tr: "окно справа сверху",
  pip_bl: "окно слева снизу",
  pip_br: "окно справа снизу",
};

export const NOT_APPROVED = "не утверждена (C)";
export const FULLSCREEN_NO_ALPHA = "без альфы: сцена на весь кадр";
const NOT_IN = "не вошла";
/** Кусок исходника под клипом короче этого — след склейки на краю окна, не показывается. */
export const MIN_PIECE_US = 500_000;

export interface Range { start: string; end: string }
export interface UsRange { start_us: number; end_us: number }
/** Клип таймлайна ревизии EDL (`timeline_clips`): кусок исходника и его начало в ролике. */
export interface TimelineClip { source_start_us: number; source_end_us: number; edited_start_us: number }

/**
 * Куски исходника под окном клипа `window` (µs ролика) по клипам таймлайна EDL, по порядку.
 * Значимые — не короче `MIN_PIECE_US` и задевающие речь `speech` (кусок только в запасе
 * lead/tail — след склейки). Значимых нет — самый длинный из всех (пустой таймлайн — []).
 */
export function sourcePieces(clips: readonly TimelineClip[], window: UsRange, speech: UsRange): UsRange[] {
  const all: { piece: UsRange; edited: UsRange }[] = [];
  for (const c of clips) {
    const eEnd = c.edited_start_us + (c.source_end_us - c.source_start_us);
    const a = Math.max(c.edited_start_us, window.start_us);
    const b = Math.min(eEnd, window.end_us);
    if (b <= a) continue;
    all.push({ piece: { start_us: c.source_start_us + (a - c.edited_start_us), end_us: c.source_start_us + (b - c.edited_start_us) }, edited: { start_us: a, end_us: b } });
  }
  const len = (r: UsRange) => r.end_us - r.start_us;
  const sig = all.filter((x) => len(x.piece) >= MIN_PIECE_US && Math.min(x.edited.end_us, speech.end_us) > Math.max(x.edited.start_us, speech.start_us));
  if (sig.length > 0) return sig.map((x) => x.piece);
  const longest = all.reduce<UsRange | undefined>((m, x) => (!m || len(x.piece) > len(m) ? x.piece : m), undefined);
  return longest ? [longest] : [];
}

export interface VideoCheatRow {
  /** Номер сцены среди принятых сцен плана (`NN`); сцена без номера — «—». */
  nn: string;
  mp4: string | null;
  alpha: string | null;
  /** Место клипа в смонтированном ролике (кадры плана, конец — по файлу версии). */
  edited: Range | null;
  /** Тот же кусок в исходнике: главный (самый длинный) кусок под клипом. */
  source: Range | null;
  /** Значимые куски исходника по порядку; ≥ 2 — клип склеен (показывается в колонке «исходник»). */
  source_pieces: Range[];
  /** Длительность файла, с; сцена не вошла — null. */
  duration_s: number | null;
  quote: string;
  /** «поверх видео · левая треть»; не вошла — «—». */
  mode: string;
  /** Утверждена ли версия (C); не вошла — false. */
  approved: boolean;
  notes: string[];
}

/** Кадр → `ЧЧ:ММ:СС:КК` по номинальному fps (29,97 → 30, как NDF-таймкод монтажки). */
export function timecode(frame: number, fps: Fps): string {
  const base = Math.max(1, Math.round(fps.num / fps.den));
  const f = Math.max(0, Math.floor(frame));
  const s = Math.floor(f / base);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(f % base)}`;
}

const sourceRange = (src: UsRange, fps: Fps): Range =>
  ({ start: timecode(usToFrame(src.start_us, fps), fps), end: timecode(usToFrameCeil(src.end_us, fps), fps) });

/** Исходник строки: куски из манифеста (старый манифест без них — `source` плана). */
function sourceOf(pieces: readonly UsRange[] | undefined, fallback: UsRange | undefined, fps: Fps): Pick<VideoCheatRow, "source" | "source_pieces"> {
  const list = pieces && pieces.length > 0 ? pieces : fallback ? [fallback] : [];
  if (list.length === 0) return { source: null, source_pieces: [] };
  const main = list.reduce((m, x) => (x.end_us - x.start_us > m.end_us - m.start_us ? x : m));
  return { source: sourceRange(main, fps), source_pieces: list.map((x) => sourceRange(x, fps)) };
}

const range = (r: Range): string => `${r.start}–${r.end}`;
/** Колонка «исходник»: главный кусок; клип склеен — все куски и как ставить. */
export function sourceText(r: Pick<VideoCheatRow, "source" | "source_pieces">): string | null {
  if (r.source_pieces.length >= 2) return `${r.source_pieces.length} куска — ${r.source_pieces.map(range).join(" + ")}; ставьте по началу, клип склеен`;
  return r.source ? range(r.source) : null;
}

/** Текст предупреждения манифеста по коду (`duration_off_plan: …` → `…`). */
const warningText = (ws: readonly string[], code: string): string | undefined =>
  ws.find((w) => w.startsWith(`${code}: `))?.slice(code.length + 2);
const warningCode = (w: string): string => /^([a-z][a-z0-9_]*): /.exec(w)?.[1] ?? "";
/** Коды, которые уже показаны отдельной фразой (не повторять общей фразой кода). */
const SHOWN = new Set(["duration_off_plan"]);

/** Строки шпаргалки по манифесту: сцены и «не вошли» по номеру; без номера — в конце. */
export function videoCheatRows(m: VideoPackageManifest): VideoCheatRow[] {
  const fps = m.fps;
  const total = Math.max(0, ...m.scenes.map((s) => s.n), ...m.missing.map((x) => x.n ?? 0));
  const missingOf = new Map(m.missing.map((x) => [x.item_id, x.reason]));
  const packed = new Set(m.scenes.map((s) => s.item_id));
  const rows: { n: number; row: VideoCheatRow }[] = [];
  for (const s of m.scenes) {
    const frames = s.duration_frames ?? s.frames.end - s.frames.start;
    const alphaReason = s.alpha === null ? (s.mode === "fullscreen" ? FULLSCREEN_NO_ALPHA : missingOf.get(s.item_id) ?? "альфа-версия не экспортирована") : undefined;
    const offPlan = warningText(s.warnings, "duration_off_plan");
    const first = [
      ...(alphaReason ? [alphaReason] : []),
      ...(s.approved ? [] : [NOT_APPROVED]),
      ...(offPlan ? [offPlan] : []),
    ];
    rows.push({
      n: s.n,
      row: {
        nn: sceneNumber(s.n, total), mp4: s.mp4.file, alpha: s.alpha?.file ?? null,
        edited: { start: timecode(s.frames.start, fps), end: timecode(s.frames.start + frames, fps) },
        ...sourceOf(s.source_pieces, s.source, fps),
        duration_s: (frames * fps.den) / fps.num,
        quote: s.quote, mode: s.mode === "fullscreen" ? MODE_RU.fullscreen : `${MODE_RU[s.mode]} · ${ZONE_RU[s.zone]}`, approved: s.approved,
        notes: cheatNotes(first, s.warnings.map(warningCode).filter((c) => c !== "" && !SHOWN.has(c))),
      },
    });
  }
  for (const x of m.missing) {
    if (packed.has(x.item_id)) continue; // альфа не вышла — сцена в папке, причина в её замечаниях
    rows.push({
      n: x.n ?? Number.POSITIVE_INFINITY,
      row: {
        nn: x.n ? sceneNumber(x.n, total) : "—", mp4: null, alpha: null,
        edited: x.frames ? { start: timecode(x.frames.start, fps), end: timecode(x.frames.end, fps) } : null,
        ...sourceOf(x.source_pieces, x.source, fps),
        duration_s: null, quote: x.quote ?? "", mode: "—", approved: false,
        notes: cheatNotes([`${NOT_IN}: ${x.reason}`], []),
      },
    });
  }
  return rows.sort((a, b) => a.n - b.n).map((r) => r.row);
}

const COLUMNS = [
  "№", "ролик: начало", "ролик: конец", "исходник", "длит., с", "файл MP4 (на весь кадр)", "файл с альфой (поверх видео)",
  "фраза", "режим", "утверждена (C)", "замечания",
] as const;
const MISSING_COLUMNS = ["№", "ролик: начало", "фраза", "причина"] as const;

const sec = (s: number): string => s.toFixed(1).replace(".", ",");
const DASH = "—";

function cells(r: VideoCheatRow): string[] {
  return [
    r.nn, r.edited?.start ?? DASH, r.edited?.end ?? DASH, sourceText(r) ?? DASH, r.duration_s === null ? DASH : sec(r.duration_s),
    r.mp4 ?? DASH, r.alpha ?? DASH, r.quote || DASH, r.mode, r.approved ? "да" : "нет", r.notes.join("; "),
  ];
}

/** Причина «не вошла» из замечаний строки. */
const reasonOf = (r: VideoCheatRow): string => (r.notes[0] ?? "").replace(new RegExp(`^${NOT_IN}: `), "");

export interface CheatInfo {
  project: string;
  fps: Fps;
}

const fpsText = (fps: Fps): string => {
  const v = fps.num / fps.den;
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, "").replace(".", ",");
};

export function videoCheatsheet(rows: readonly VideoCheatRow[], format: CheatFormat, info?: CheatInfo): string {
  if (format === "csv") {
    const lines = [COLUMNS.join(";"), ...rows.map((r) => cells(r).map((c) => csvField(c)).join(";"))];
    return `\uFEFF${lines.join("\r\n")}\r\n`;
  }
  if (format === "txt") {
    return rows.map((r) => {
      const where = [
        r.nn,
        ...(r.edited ? [`ролик ${r.edited.start}–${r.edited.end}`] : []),
        ...(r.source ? [`исходник ${sourceText(r)!}`] : []),
      ];
      const quote = `«${oneLine(r.quote)}»`;
      if (r.mp4 === null) return `${[...where, quote, r.notes.map(oneLine).join("; ")].join(" · ")}\n`;
      const files = r.alpha ? `${r.mp4} + ${r.alpha}` : r.mp4;
      return `${[...where, `${sec(r.duration_s ?? 0)} с`, r.mode, `C: ${r.approved ? "да" : "нет"}`, quote, files].join(" · ")}\n`;
    }).join("");
  }
  const clips = rows.filter((r) => r.mp4 !== null);
  const missing = rows.filter((r) => r.mp4 === null);
  const out: string[] = ["# Шпаргалка: клипы ↔ ролик", ""];
  if (info) out.push(`Проект «${oneLine(info.project)}» · fps ${fpsText(info.fps)} · таймкоды ЧЧ:ММ:СС:КК (КК — кадр).`, "");
  out.push(
    "«Ролик» — где клип стоит в смонтированном ролике (от его начала), «исходник» — тот же кусок в исходном видео.",
    "MP4 — клип на весь кадр со своим фоном; _alpha.mov — тот же клип с прозрачностью (ProRes 4444), кладите его дорожкой поверх видео с момента «ролик: начало».",
    "",
    mdRow(COLUMNS), `|${COLUMNS.map(() => "---").join("|")}|`, ...clips.map((r) => mdRow(cells(r))), "",
  );
  if (missing.length > 0) {
    out.push(`## Не вошли в папку (${missing.length})`, "", mdRow(MISSING_COLUMNS), `|${MISSING_COLUMNS.map(() => "---").join("|")}|`,
      ...missing.map((r) => mdRow([r.nn, r.edited?.start ?? DASH, r.quote || DASH, reasonOf(r)])), "");
  }
  return out.join("\n");
}
