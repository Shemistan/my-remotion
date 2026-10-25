// Дорожка визуального плана (Task 33) под линейкой «После монтажа»: сцена — блок на оси edited,
// цвет — по режиму (`composition_mode`), штриховка — предложено, красная рамка — устарело или есть
// блокирующая проблема сцены, отклонённые — бледно. Пересекающиеся сцены — на разных дорожках
// (`trackLayout`). Пропуски агента — тонкие отметки с причиной во всплывающей подсказке.
import type { PlanIssue, ScenePlanItem } from "@ms/contracts";
import { t } from "../../i18n/index.js";
import { trackLayout } from "../../video/plan-layout.js";
import { formatTimecode } from "../../video/use-timeline.js";
import { MODES } from "./PlanInspector.js";

export interface PlanTrackProps {
  items: readonly ScenePlanItem[];
  issues: readonly PlanIssue[];
  /** Длительность после монтажа, µs. */
  durationUs: number;
  /** Пропуски с моментом на оси edited (первое слово якоря). */
  skipped: readonly { at_us: number; reason: string }[];
  selected?: string | undefined;
  /** Текущее время плеера на оси edited, µs. */
  currentUs?: number | undefined;
  onSelect: (id: string) => void;
}

const SCALE = 1000;
const LANE_PX = 22;

export function PlanTrack({ items, issues, durationUs, skipped, selected, currentUs, onSelect }: PlanTrackProps) {
  const boxes = trackLayout(items.map((x) => ({ id: x.id, start_us: x.edited.start_us, end_us: x.edited.end_us })), durationUs, SCALE);
  const lanes = Math.max(1, ...boxes.map((b) => b.lane + 1));
  const blocking = new Set(issues.filter((i) => i.severity === "blocking" && i.item_id).map((i) => i.item_id!));
  const pct = (us: number) => `${durationUs > 0 ? Math.min(100, Math.max(0, (100 * us) / durationUs)) : 0}%`;
  return (
    <section className="panel plan-track-panel" aria-label={t("plan.track")}>
      <div className="tl-label muted small">{t("plan.track")}</div>
      <div className="plan-track" data-testid="plan-track" style={{ height: `${lanes * LANE_PX + 6}px` }}>
        {items.length === 0 ? <span className="plan-track-empty muted small">{t("plan.trackEmpty")}</span> : null}
        {items.map((x, i) => {
          const b = boxes[i]!;
          const cls = ["plan-item", `mode-${x.composition_mode}`, `status-${x.status}`];
          if (x.status === "stale" || blocking.has(x.id)) cls.push("problem");
          if (selected === x.id) cls.push("selected");
          const title = [
            `${x.id} · ${t(`plan.mode.${x.composition_mode}`)} · ${t(`plan.status.${x.status}`)}`,
            t("plan.sceneRange", { from: formatTimecode(x.edited.start_us), to: formatTimecode(x.edited.end_us) }),
            x.purpose,
          ].join("\n");
          return (
            <button
              key={x.id}
              type="button"
              className={cls.join(" ")}
              data-testid={`plan-item-${x.id}`}
              data-lane={b.lane}
              aria-pressed={selected === x.id}
              title={title}
              style={{ left: `${b.left / (SCALE / 100)}%`, width: `${b.width / (SCALE / 100)}%`, top: `${3 + b.lane * LANE_PX}px` }}
              onClick={() => onSelect(x.id)}
            >
              <span className="plan-item-label">{x.id.replace("sp_", "")}</span>
            </button>
          );
        })}
        {skipped.map((s, i) => (
          <span key={`skip-${i}`} className="plan-skip" data-testid="plan-skip" style={{ left: pct(s.at_us) }} title={t("plan.skipped", { reason: s.reason })} />
        ))}
        {currentUs !== undefined ? <span className="tl-cursor" style={{ left: pct(currentUs) }} /> : null}
      </div>
      <div className="row wrap small muted plan-legend" data-testid="plan-legend">
        <span>{t("plan.legend")}</span>
        {MODES.map((m) => <span key={m} className={`legend-chip mode-${m}`}>{t(`plan.mode.${m}`)}</span>)}
        <span className="legend-chip status-proposed">{t("plan.legend.proposed")}</span>
        <span className="legend-chip problem">{t("plan.legend.problem")}</span>
      </div>
    </section>
  );
}
