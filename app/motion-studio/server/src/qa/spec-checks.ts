// Проверки спецификации без рендера (ТЗ §8.1–8.2): одинаковые входы, перекрытия по
// layout, safe area, наличие акцента. `layout` элемента — доли safe area, а не кадра
// (prompts/motion-director.md §8): в кадр он переводится через safeRect настроек.
import type { Element, MotionSpec, QAIssue, Settings } from "@ms/contracts";
import { ACCENT_ACTION, isEmphasisRole } from "../pipeline/qa-frames.js";

type Layout = NonNullable<Element["layout"]>;

const UNIFORM_MIN = 3;
const UNIFORM_WARN_SHARE = 0.6;
/** Перекрытие двух элементов, доля площади кадра. */
const OVERLAP_MAX = 0.01;
/** Элемент на (почти) весь кадр — фон или атмосфера: не перекрывает и не выходит за safe area. */
const FULL_BLEED = 0.9;
const EPS = 1e-6;

const area = (l: Layout) => l.w * l.h;
const intersection = (a: Layout, b: Layout) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const contains = (a: Layout, b: Layout) => b.x >= a.x - EPS && b.y >= a.y - EPS && b.x + b.w <= a.x + a.w + EPS && b.y + b.h <= a.y + a.h + EPS;
const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

export function specChecks(spec: MotionSpec, settings: Settings): QAIssue[] {
  const out: Omit<QAIssue, "source">[] = [];

  // одинаковые входы (ТЗ §8.2): none — не вход
  const entering = spec.elements.filter((e) => e.entrance !== "none");
  if (entering.length >= UNIFORM_MIN) {
    const counts = new Map<string, string[]>();
    for (const e of entering) counts.set(e.entrance, [...(counts.get(e.entrance) ?? []), e.id]);
    const [kind, ids] = [...counts].sort((a, b) => b[1].length - a[1].length)[0]!;
    const share = ids.length / entering.length;
    if (share === 1 || share > UNIFORM_WARN_SHARE) {
      out.push({
        code: "uniform_entrance", severity: share === 1 ? "blocking" : "warning", area: ids.join(", "),
        description: share === 1
          ? `все ${ids.length} элементов входят одинаково (${kind})`
          : `${ids.length} из ${entering.length} элементов входят одинаково (${kind})`,
        fix_hint: "разные объекты — разные входы: заголовок rise/mask, число count, график draw, карточки scale/pop, подписи fade",
      });
    }
  }

  // layout → доли кадра: x_кадра = поле + x × ширина safe area
  const sx = settings.safe_area.x;
  const sy = settings.safe_area.y;
  const toFrame = (l: Layout): Layout => ({ x: sx + l.x * (1 - 2 * sx), y: sy + l.y * (1 - 2 * sy), w: l.w * (1 - 2 * sx), h: l.h * (1 - 2 * sy) });
  const placed = spec.elements
    .filter((e): e is Element & { layout: Layout } => e.layout !== undefined && e.kind !== "group" && area(e.layout) < FULL_BLEED)
    .map((e) => ({ ...e, frame: toFrame(e.layout) }));

  // перекрытия одного слоя глубины; вложенный элемент (подпись в карточке) не перекрытие
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [a, b] = [placed[i]!, placed[j]!];
      if ((a.depth_layer ?? 1) !== (b.depth_layer ?? 1)) continue;
      if (contains(a.layout, b.layout) || contains(b.layout, a.layout)) continue;
      const inter = intersection(a.frame, b.frame);
      if (inter > OVERLAP_MAX) {
        out.push({
          code: "overlap", severity: "blocking", area: `${a.id}, ${b.id}`,
          description: `layout ${a.id} и ${b.id} пересекаются на ${pct(inter)} кадра`,
          fix_hint: `разведи layout ${a.id} и ${b.id} (доли safe area) по сетке или вложи одно в другое явно; один слой — без наложений`,
        });
      }
    }
  }

  // layout — доли safe area: за неё выходит только layout с x + w > 1 или y + h > 1
  // (Zod-схема spec такое отклоняет; проверка — для spec, собранных в обход схемы)
  for (const e of placed) {
    const l = e.layout;
    if (l.x < -EPS || l.y < -EPS || l.x + l.w > 1 + EPS || l.y + l.h > 1 + EPS) {
      out.push({
        code: "outside_safe_area", severity: "warning", area: e.id,
        description: `layout ${e.id} выходит за безопасную зону: x + w = ${(l.x + l.w).toFixed(2)}, y + h = ${(l.y + l.h).toFixed(2)} (доли safe area)`,
        fix_hint: `layout — доли safe area от 0 до 1: x + w ≤ 1 и y + h ≤ 1 для ${e.id}`,
      });
    }
  }

  if (!spec.elements.some((e) => isEmphasisRole(e.role)) && !spec.beats.some((b) => ACCENT_ACTION.test(b.action))) {
    out.push({
      code: "no_emphasis", severity: "warning",
      description: "в сцене нет акцента: ни элемента role = emphasis, ни бита emphasis/accent",
      fix_hint: "добавь главный акцент: бит emphasis на ключевом элементе (подсветка, пульс, итоговая плашка)",
    });
  }
  return out.map((i) => ({ source: "programmatic", ...i }));
}
