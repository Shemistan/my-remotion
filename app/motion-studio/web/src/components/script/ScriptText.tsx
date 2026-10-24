// Текст сценария с подсветкой фрагментов плана (S8, спека §8): номер сцены — на полях фрагмента
// (псевдоэлемент CSS, в выделение не попадает), убранные сцены — зачёркнуты, пропуски агента —
// пунктиром с причиной. Выделение мышью отдаётся наверх смещениями символов в блоке.
import type { ScriptPlanRevisionDoc, ScriptRevisionDoc, ScriptSceneItem } from "@ms/contracts";
import { type ReactNode, useRef } from "react";
import { t } from "../../i18n/index.js";
import { type BlockRange, domSelectionRange } from "../../script/selection.js";
import "./script.css";

export interface ScriptTextProps {
  doc: ScriptRevisionDoc;
  items?: readonly ScriptSceneItem[];
  skipped?: ScriptPlanRevisionDoc["skipped"];
  /** Номер принятой сцены по id; убранной — нет. */
  numbers?: ReadonlyMap<string, number>;
  selectedId?: string | null;
  onSelectItem?: (id: string) => void;
  onSelection?: (r: BlockRange | "cross_block" | null) => void;
}

interface Span {
  start: number;
  end: number;
  item?: ScriptSceneItem;
  skip?: string;
}

/** Фрагменты блока без пересечений: сначала принятые сцены, потом убранные, потом пропуски. */
function spansOf(doc: ScriptRevisionDoc, blockId: string, items: readonly ScriptSceneItem[], skipped: ScriptPlanRevisionDoc["skipped"]): Span[] {
  const pos = new Map(doc.words.filter((w) => w.block_id === blockId).map((w) => [w.id, w]));
  const out: Span[] = [];
  const place = (s: string, e: string, extra: Omit<Span, "start" | "end">) => {
    const a = pos.get(s);
    const b = pos.get(e);
    if (!a || !b || b.end <= a.start) return;
    if (out.some((x) => x.start < b.end && x.end > a.start)) return;
    out.push({ start: a.start, end: b.end, ...extra });
  };
  for (const x of items.filter((i) => i.status === "accepted")) place(x.start_word_id, x.end_word_id, { item: x });
  for (const x of items.filter((i) => i.status !== "accepted")) place(x.start_word_id, x.end_word_id, { item: x });
  for (const x of skipped) place(x.start_word_id, x.end_word_id, { skip: x.reason });
  return out.sort((a, b) => a.start - b.start);
}

export function ScriptText({ doc, items = [], skipped = [], numbers, selectedId, onSelectItem, onSelection }: ScriptTextProps) {
  const root = useRef<HTMLDivElement>(null);
  const onMouseUp = () => {
    if (onSelection && root.current) onSelection(domSelectionRange(root.current, window.getSelection()));
  };
  return (
    <div className="script-text" ref={root} data-testid="script-text" onMouseUp={onMouseUp} onKeyUp={onMouseUp}>
      {doc.blocks.map((b, bi) => {
        const parts: ReactNode[] = [];
        let at = 0;
        for (const s of spansOf(doc, b.id, items, skipped)) {
          if (s.start > at) parts.push(<span key={`t${at}`}>{b.text.slice(at, s.start)}</span>);
          const text = b.text.slice(s.start, s.end);
          if (s.item) {
            const x = s.item;
            const n = numbers?.get(x.id);
            parts.push(
              <mark
                key={`m${s.start}`}
                data-testid="scene-fragment"
                data-fragment-item={x.id}
                {...(n !== undefined ? { "data-n": String(n) } : {})}
                className={`scene-fragment${x.status === "accepted" ? "" : " rejected"}${selectedId === x.id ? " selected" : ""}`}
                title={n !== undefined ? t("scriptPlan.scene.n", { n }) : t("scriptPlan.scene.rejected")}
                onClick={() => onSelectItem?.(x.id)}
              >
                {text}
              </mark>,
            );
          } else {
            parts.push(<span key={`s${s.start}`} className="skip-fragment" title={s.skip}>{text}</span>);
          }
          at = s.end;
        }
        if (at < b.text.length) parts.push(<span key={`t${at}`}>{b.text.slice(at)}</span>);
        return (
          <div key={b.id}>
            <h3 className="script-block-title">{b.title || t("scriptPlan.block.untitled", { n: bi + 1 })}</h3>
            <p className="script-block" data-block-id={b.id}>{parts}</p>
          </div>
        );
      })}
    </div>
  );
}
