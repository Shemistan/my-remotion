// Волна звука исходника (пары min/max Int8 на ведро 10 мс из `waveform.bin`) с отметками
// вырезок (принятые — сплошные, предложенные — штриховка) и курсором; клик — переход.
import type { EditDecision } from "@ms/contracts";
import { useQuery } from "@tanstack/react-query";
import type { MouseEvent } from "react";
import { urls } from "../../api/client.js";
import { t } from "../../i18n/index.js";

const COLUMNS = 600;

async function loadPeaks(mediaId: string): Promise<Int8Array> {
  const r = await fetch(urls.waveform(mediaId), { credentials: "same-origin" });
  if (!r.ok) throw new Error(`waveform ${r.status}`);
  return new Int8Array(await r.arrayBuffer());
}

/** Высота столбца (0…1) на `columns` колонок: максимум |min|,|max| по вёдрам колонки. */
export function columnsOf(peaks: Int8Array, columns: number): number[] {
  const buckets = Math.floor(peaks.length / 2);
  if (buckets === 0) return [];
  const n = Math.min(columns, buckets);
  const out: number[] = [];
  for (let c = 0; c < n; c++) {
    let m = 0;
    for (let b = Math.floor((c * buckets) / n); b < Math.floor(((c + 1) * buckets) / n); b++) {
      m = Math.max(m, Math.abs(peaks[2 * b]!), Math.abs(peaks[2 * b + 1]!));
    }
    out.push(m / 128);
  }
  return out;
}

export interface WaveformProps {
  mediaId: string;
  hasWaveform: boolean;
  durationUs: number;
  decisions: EditDecision[];
  currentUs: number;
  onSeek: (sourceUs: number) => void;
}

export function Waveform({ mediaId, hasWaveform, durationUs, decisions, currentUs, onSeek }: WaveformProps) {
  const q = useQuery({ queryKey: ["waveform", mediaId], queryFn: () => loadPeaks(mediaId), enabled: hasWaveform, staleTime: Infinity });
  if (!hasWaveform) return <p className="muted small">{t("video.noWaveform")}</p>;
  const cols = q.data ? columnsOf(q.data, COLUMNS) : [];
  const x = (us: number) => (1000 * us) / Math.max(1, durationUs);
  const click = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width > 0) onSeek(Math.round(((e.clientX - r.left) / r.width) * durationUs));
  };
  return (
    <svg className="waveform" viewBox="0 0 1000 60" preserveAspectRatio="none" role="img" aria-label={t("video.waveform")} onClick={click} data-testid="waveform">
      {decisions.filter((d) => d.status !== "rejected").map((d) => (
        <rect key={d.id} className={`wf-cut ${d.status}`} x={x(d.source_start_us)} y={0} width={Math.max(1, x(d.source_end_us) - x(d.source_start_us))} height={60} />
      ))}
      {cols.map((h, i) => {
        const w = 1000 / cols.length;
        const hh = Math.max(0.5, h * 28);
        return <rect key={i} className="wf-bar" x={i * w} y={30 - hh} width={Math.max(0.5, w * 0.8)} height={2 * hh} />;
      })}
      <line className="wf-cursor" x1={x(currentUs)} x2={x(currentUs)} y1={0} y2={60} />
    </svg>
  );
}
