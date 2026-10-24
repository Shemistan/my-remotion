// Проверка синхронности звука превью (Task 28, Review Focus 2): для n слов, оставленных в
// монтаже, окно звука исходника вокруг слова ищется взаимной корреляцией в превью около
// edited-времени того же слова. Смещение > кадра — звук превью уехал относительно картинки
// (видео режется по тем же границам клипов).
import { open } from "node:fs/promises";
import { type EditedTimeline, type TranscriptWord, mapWords, sourceToEdited } from "@ms/contracts";

/**
 * Лаг `b` относительно `a` в сэмплах из `[minLag, maxLag]`: максимум нормированной корреляции
 * `Σ a[i]·b[i+lag] / √(Σa²·Σb²)` по перекрытию. Перекрытие короче половины `a` не считается.
 */
export function xcorrLag(a: Int16Array, b: Int16Array, minLag: number, maxLag: number): { lag: number; corr: number } {
  const pa = new Float64Array(a.length + 1);
  for (let i = 0; i < a.length; i++) pa[i + 1] = pa[i]! + a[i]! * a[i]!;
  const pb = new Float64Array(b.length + 1);
  for (let i = 0; i < b.length; i++) pb[i + 1] = pb[i]! + b[i]! * b[i]!;
  let best = { lag: 0, corr: -Infinity };
  for (let lag = minLag; lag <= maxLag; lag++) {
    const i0 = Math.max(0, -lag);
    const i1 = Math.min(a.length, b.length - lag);
    if (i1 - i0 < a.length / 2) continue;
    let s = 0;
    for (let i = i0; i < i1; i++) s += a[i]! * b[i + lag]!;
    const ea = pa[i1]! - pa[i0]!;
    const eb = pb[i1 + lag]! - pb[i0 + lag]!;
    const corr = ea > 0 && eb > 0 ? s / Math.sqrt(ea * eb) : 0;
    if (corr > best.corr) best = { lag, corr };
  }
  return best.corr === -Infinity ? { lag: 0, corr: 0 } : best;
}

/** Смещение `b` относительно `a`, µs (`b` запаздывает — положительное), поиск в ±`maxLagUs`. */
export function audioOffsetUs(a: Int16Array, b: Int16Array, sampleRate: number, maxLagUs: number): number {
  const m = Math.round((maxLagUs * sampleRate) / 1e6);
  return Math.round((xcorrLag(a, b, -m, m).lag * 1e6) / sampleRate);
}

/** Источник PCM моно s16: чтение окна сэмплов (за краями — нули). */
export interface PcmReader {
  sampleRate: number;
  length: number;
  read(start: number, count: number): Promise<Int16Array>;
}

/** PCM из массива (тесты). */
export function arrayPcm(pcm: Int16Array, sampleRate: number): PcmReader {
  return {
    sampleRate, length: pcm.length,
    read: async (start, count) => {
      const out = new Int16Array(count);
      for (let i = 0; i < count; i++) {
        const k = start + i;
        if (k >= 0 && k < pcm.length) out[i] = pcm[k]!;
      }
      return out;
    },
  };
}

/** PCM s16le моно из WAV окнами (файл в память целиком не читается). */
export async function wavPcm(path: string): Promise<PcmReader & { close(): Promise<void> }> {
  const fh = await open(path, "r");
  try {
    const size = (await fh.stat()).size;
    const head = Buffer.alloc(Math.min(size, 64 * 1024));
    await fh.read(head, 0, head.length, 0);
    if (head.length < 12 || head.toString("ascii", 0, 4) !== "RIFF" || head.toString("ascii", 8, 12) !== "WAVE") throw new Error(`не wav: ${path}`);
    let off = 12;
    let sampleRate = 0;
    let channels = 0;
    let bits = 0;
    while (off + 8 <= head.length) {
      const id = head.toString("ascii", off, off + 4);
      const len = head.readUInt32LE(off + 4);
      if (id === "fmt ") {
        channels = head.readUInt16LE(off + 10);
        sampleRate = head.readUInt32LE(off + 12);
        bits = head.readUInt16LE(off + 22);
      }
      if (id === "data") {
        if (channels !== 1 || bits !== 16) throw new Error(`wav не моно s16: ${path} (${channels} кан., ${bits} бит)`);
        const body = off + 8;
        const bytes = Math.min(len, size - body);
        const length = Math.floor(bytes / 2);
        return {
          sampleRate, length,
          read: async (start, count) => {
            const out = new Int16Array(count);
            const from = Math.max(0, start);
            const to = Math.min(length, start + count);
            if (to > from) {
              const buf = Buffer.alloc((to - from) * 2);
              await fh.read(buf, 0, buf.length, body + from * 2);
              for (let i = 0; i < to - from; i++) out[from - start + i] = buf.readInt16LE(2 * i);
            }
            return out;
          },
          close: () => fh.close(),
        };
      }
      off += 8 + len + (len % 2);
    }
    throw new Error(`в wav нет чанка data в первых 64 КиБ: ${path}`);
  } catch (e) {
    await fh.close();
    throw e;
  }
}

export interface SyncSample {
  word_id: string;
  /** Смещение звука превью относительно ожидаемого места, µs (+ — запаздывает). */
  offset_us: number;
  /** Нормированная корреляция в найденной точке (0…1): ниже `SYNC_MIN_CORR` — замер ненадёжен. */
  corr: number;
  /** В окне исходника есть звук (RMS выше `SYNC_MIN_RMS_DBFS`): без него замер не нужен. */
  energy: boolean;
  /** Проход, давший замер: 1 — поиск ±`maxLagUs`, 2 — широкий поиск ±`wideLagUs` при низкой корреляции. */
  pass: 1 | 2;
}

export interface SyncOptions {
  /** Полуокно звука исходника вокруг начала слова, µs (0,5 с). */
  windowUs?: number;
  /** Поиск смещения в ±, µs (0,25 с). */
  maxLagUs?: number;
  /** Второй проход при низкой корреляции: поиск в ±, µs (2 с). */
  wideLagUs?: number;
}

/** Корреляция ниже — замер синхронности ненадёжен (тишина, шум, чужой звук). */
export const SYNC_MIN_CORR = 0.5;
/** Окно исходника тише (RMS, dBFS) — «без энергии»: замер по нему не требуется. */
export const SYNC_MIN_RMS_DBFS = -40;
/** Прореживание первого шага широкого поиска (16 кГц → 2 кГц). */
const WIDE_DECIMATE = 8;

function rmsDbfs(a: Int16Array): number {
  if (a.length === 0) return -Infinity;
  let e = 0;
  for (let i = 0; i < a.length; i++) e += a[i]! * a[i]!;
  return 20 * Math.log10(Math.sqrt(e / a.length) / 32768);
}

/** Среднее по `k` сэмплам (грубый ФНЧ и прореживание). */
function decimate(a: Int16Array, k: number): Int16Array {
  const out = new Int16Array(Math.floor(a.length / k));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += a[i * k + j]!;
    out[i] = Math.round(s / k);
  }
  return out;
}

/**
 * Синхронность превью по `n` словам, равномерно по словам с оставленным началом (длина > 0):
 * окно исходника `[start − W, start + W]` в пределах клипа слова сравнивается с превью около
 * edited-времени того же места. Слова, чьё окно целиком в одном клипе, — первыми. Корреляция ниже
 * `SYNC_MIN_CORR` на окне со звуком — второй проход с поиском ±`wideLagUs` (звук уехал дальше
 * узкого окна: без него сдвиг 0,4 с давал «ненадёжный замер» и проходил, ревью Task 28 I1).
 */
export async function syncCheck(source: PcmReader, preview: PcmReader, tl: EditedTimeline, words: Pick<TranscriptWord, "id" | "start_us" | "end_us">[], n = 5, o: SyncOptions = {}): Promise<SyncSample[]> {
  if (source.sampleRate !== preview.sampleRate) throw new Error(`syncCheck: разная частота (${source.sampleRate} и ${preview.sampleRate})`);
  const sr = source.sampleRate;
  const W = o.windowUs ?? 500_000;
  const M = Math.round(((o.maxLagUs ?? 250_000) * sr) / 1e6);
  const M2 = Math.round(((o.wideLagUs ?? 2_000_000) * sr) / 1e6);
  const map = mapWords(tl, words);
  const clipOf = (us: number) => tl.clips.find((c) => c.source_start_us <= us && us < c.source_end_us);
  // слово целиком или с оставленным началом (у частой нарезки целых слов может не быть)
  const kept = words.filter((w) => w.end_us > w.start_us && w.start_us < tl.source_duration_us && map[w.id]?.state !== "removed" && !sourceToEdited(tl, w.start_us).inCut);
  const inside = kept.filter((w) => {
    const c = clipOf(w.start_us);
    return c !== undefined && w.start_us - W >= c.source_start_us && w.start_us + W <= c.source_end_us;
  });
  const pool = inside.length >= n ? inside : kept;
  const picked = pool.length <= n ? pool : Array.from({ length: n }, (_, k) => pool[Math.floor(((k + 0.5) * pool.length) / n)]!);
  const out: SyncSample[] = [];
  for (const w of picked) {
    const c = clipOf(w.start_us)!;
    const s0 = Math.max(c.source_start_us, w.start_us - W);
    const s1 = Math.min(c.source_end_us, w.start_us + W);
    const a = await source.read(Math.round((s0 * sr) / 1e6), Math.round(((s1 - s0) * sr) / 1e6));
    const energy = rmsDbfs(a) > SYNC_MIN_RMS_DBFS;
    const e0 = Math.round((sourceToEdited(tl, s0).us * sr) / 1e6);
    const b = await preview.read(e0 - M, a.length + 2 * M);
    const r = xcorrLag(a, b, 0, 2 * M);
    let best = { offset: r.lag - M, corr: r.corr, pass: 1 as 1 | 2 };
    if (energy && r.corr < SYNC_MIN_CORR && M2 > M) {
      // широкий поиск: грубо по прореженному звуку, затем точно около найденного лага
      const b2 = await preview.read(e0 - M2, a.length + 2 * M2);
      const coarse = xcorrLag(decimate(a, WIDE_DECIMATE), decimate(b2, WIDE_DECIMATE), 0, Math.floor((2 * M2) / WIDE_DECIMATE));
      const at = coarse.lag * WIDE_DECIMATE;
      const fine = xcorrLag(a, b2, Math.max(0, at - 2 * WIDE_DECIMATE), Math.min(2 * M2, at + 2 * WIDE_DECIMATE));
      if (fine.corr > best.corr) best = { offset: fine.lag - M2, corr: fine.corr, pass: 2 };
    }
    out.push({ word_id: w.id, offset_us: Math.round((best.offset * 1e6) / sr), corr: Math.round(best.corr * 1000) / 1000, energy, pass: best.pass });
  }
  return out;
}

/**
 * Вердикт синхронности (ревью Task 28, I1): надёжный замер (корреляция ≥ `minCorr`) со смещением
 * больше кадра — отказ; надёжных меньше половины (⌈m/2⌉) замеров на окнах со звуком — отказ
 * «синхронность не подтверждена» (ненадёжные замеры больше не отбрасываются молча). Окна без
 * звука не считаются: тихая запись синхронность не подтверждает и не опровергает.
 */
export function judgeSync(samples: SyncSample[], frameUs: number, minCorr = SYNC_MIN_CORR): { ok: true; reliable: number; voiced: number } | { ok: false; message: string } {
  const voiced = samples.filter((s) => s.energy);
  const reliable = voiced.filter((s) => s.corr >= minCorr);
  const fmt = (xs: SyncSample[]) => xs.map((s) => `${s.word_id} ${(s.offset_us / 1000).toFixed(1)} мс (корр. ${s.corr})`).join(", ");
  const off = reliable.filter((s) => Math.abs(s.offset_us) > frameUs);
  if (off.length > 0) return { ok: false, message: `звук превью смещён больше чем на кадр: ${fmt(off)}` };
  const need = Math.ceil(voiced.length / 2);
  if (reliable.length < need) {
    return { ok: false, message: `синхронность не подтверждена: надёжных замеров ${reliable.length} из ${voiced.length} со звуком (нужно ≥ ${need}, корреляция ≥ ${minCorr}): ${fmt(voiced)}` };
  }
  return { ok: true, reliable: reliable.length, voiced: voiced.length };
}
