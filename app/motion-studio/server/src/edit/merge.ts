// Слияние предложений чернового монтажа (Task 28): вердикты агента по вырезкам детекторов и
// пересечения вырезок. Всё на выходе — `proposed`: решает человек (Approval A).
import type { EditDecision, Fps, RoughCutAgentOutput, TranscriptWord } from "@ms/contracts";
import { reanchorDecisions } from "./edl-ops.js";

/** Уверенность вырезки детектора, которую агент советует не делать. */
export const DROPPED_CONFIDENCE = 0.3;

export interface MergeOptions {
  /** Слова и fps — якоря вырезки-объединения считаются по словам внутри неё (как `reanchorDecisions`). */
  words?: Pick<TranscriptWord, "id" | "start_us" | "end_us">[];
  fps?: Fps;
  /** Вердикт по id, которого нет среди вырезок детекторов. */
  onUnknownReview?: (decisionId: string) => void;
}

/** Порядок причин в объединении без агентской части: смысловая причина важнее паузы. */
const PRIORITY: Record<EditDecision["reason"], number> = { false_start: 0, bad_take: 1, repeat: 2, filler: 3, manual: 4, pause: 5 };

const joinText = (xs: (string | undefined)[]): string | undefined => {
  const uniq = [...new Set(xs.filter((x): x is string => x !== undefined && x.trim() !== ""))];
  return uniq.length > 0 ? uniq.join("; ") : undefined;
};

function union(parts: EditDecision[], o: MergeOptions): EditDecision {
  if (parts.length === 1) return parts[0]!;
  const agent = parts.find((p) => p.origin === "agent");
  const lead = agent ?? [...parts].sort((a, b) => PRIORITY[a.reason] - PRIORITY[b.reason] || (b.source_end_us - b.source_start_us) - (a.source_end_us - a.source_start_us))[0]!;
  const start = Math.min(...parts.map((p) => p.source_start_us));
  const end = Math.max(...parts.map((p) => p.source_end_us));
  const note = joinText(parts.map((p) => p.agent_note));
  const merged: EditDecision = {
    id: parts[0]!.id, reason: lead.reason, origin: agent ? "agent" : "detector", status: "proposed",
    source_start_us: start, source_end_us: end, confidence: Math.max(...parts.map((p) => p.confidence)),
    explanation: joinText(parts.map((p) => p.explanation)) ?? lead.explanation,
    ...(note ? { agent_note: note } : {}),
  };
  if (o.words && o.fps) {
    // якоря — слова внутри объединения (тот же критерий, что у пересчёта якорей Task 27)
    const probe = { ...merged, start_word_id: "w_000000", end_word_id: "w_000000" };
    return reanchorDecisions([probe], o.words, o.fps)[0]!;
  }
  const anchored = parts.filter((p) => p.start_word_id !== undefined);
  const first = anchored.sort((a, b) => a.source_start_us - b.source_start_us)[0];
  const last = [...anchored].sort((a, b) => b.source_end_us - a.source_end_us)[0];
  return first && last ? { ...merged, start_word_id: first.start_word_id!, end_word_id: last.end_word_id! } : merged;
}

/**
 * Вердикты агента и пересечения. `drop_cut` по вырезке детектора → уверенность не выше 0.3 и
 * `agent_note` с причиной (вырезка остаётся предложением — человек видит обе стороны);
 * `keep_cut` — `agent_note`. Пересекающиеся вырезки (агента и детекторов, разных детекторов)
 * → одна вырезка-объединение: id первой, причина агента (или самая смысловая), объяснения
 * обеих, уверенность — наибольшая. Касание концами — не пересечение. Порядок — по началу.
 */
export function mergeProposals(detector: EditDecision[], agent: RoughCutAgentOutput, agentCuts: EditDecision[], o: MergeOptions = {}): EditDecision[] {
  const byId = new Map(detector.map((d) => [d.id, { ...d, status: "proposed" as const }]));
  for (const r of agent.reviews) {
    const d = byId.get(r.decision_id);
    if (!d) {
      o.onUnknownReview?.(r.decision_id);
      continue;
    }
    const note = r.verdict === "drop_cut" ? r.why.trim() : `агент за вырезку: ${r.why.trim()}`;
    byId.set(d.id, {
      ...d, agent_note: joinText([d.agent_note, note])!,
      ...(r.verdict === "drop_cut" ? { confidence: Math.min(d.confidence, DROPPED_CONFIDENCE) } : {}),
    });
  }
  const all = [...byId.values(), ...agentCuts.map((d) => ({ ...d, status: "proposed" as const }))]
    .sort((a, b) => a.source_start_us - b.source_start_us || a.source_end_us - b.source_end_us);
  const out: EditDecision[] = [];
  let group: EditDecision[] = [];
  let groupEnd = -1;
  for (const d of all) {
    if (group.length > 0 && d.source_start_us < groupEnd) {
      group.push(d);
      groupEnd = Math.max(groupEnd, d.source_end_us);
      continue;
    }
    if (group.length > 0) out.push(union(group, o));
    group = [d];
    groupEnd = d.source_end_us;
  }
  if (group.length > 0) out.push(union(group, o));
  return out;
}

/** Доля новой вырезки внутри решённой — от неё новая считается «тем же местом». */
export const SAME_PLACE_SHARE = 0.5;

const overlap = (a: EditDecision, b: EditDecision): number =>
  Math.max(0, Math.min(a.source_end_us, b.source_end_us) - Math.max(a.source_start_us, b.source_start_us));

/**
 * Повторный `roughcut.propose` поверх текущей ревизии EDL (одна EDL на проект, ревью Task 27 M6).
 * Остаются: все решения пользователя (`origin: "user"`) и все вырезки, по которым человек уже
 * решил (`accepted`/`rejected`), — с якорями по текущему транскрипту. Прежние `proposed` детекторов
 * и агента заменяются новыми предложениями. Новое предложение, которое не меньше чем наполовину
 * лежит в решённой вырезке, не добавляется: отклонённое человеком не воскресает, принятое не
 * дублируется. Новое, совпавшее с прежним `proposed` по происхождению, причине и границам, берёт
 * его id (повтор без изменений даёт тот же документ — `no_change`). Порядок — по началу.
 */
export function carryOver(
  base: EditDecision[], fresh: EditDecision[], words: Pick<TranscriptWord, "id" | "start_us" | "end_us">[], fps: Fps,
): { decisions: EditDecision[]; suppressed: EditDecision[] } {
  const kept = reanchorDecisions(base.filter((d) => d.origin === "user" || d.status !== "proposed"), words, fps);
  const oldProposed = base.filter((d) => d.origin !== "user" && d.status === "proposed");
  const taken = new Set(kept.map((d) => d.id));
  const suppressed: EditDecision[] = [];
  const added: EditDecision[] = [];
  for (const f of fresh) {
    const len = f.source_end_us - f.source_start_us;
    if (kept.some((k) => overlap(f, k) >= SAME_PLACE_SHARE * len)) {
      suppressed.push(f);
      continue;
    }
    const same = oldProposed.find((x) => !taken.has(x.id) && x.origin === f.origin && x.reason === f.reason
      && x.source_start_us === f.source_start_us && x.source_end_us === f.source_end_us);
    let id = same?.id ?? f.id;
    if (taken.has(id)) {
      let k = 2;
      while (taken.has(`${f.id}_${k}`)) k++;
      id = `${f.id}_${k}`;
    }
    taken.add(id);
    added.push({ ...f, id });
  }
  const byStart = (a: EditDecision, b: EditDecision) =>
    a.source_start_us - b.source_start_us || a.source_end_us - b.source_end_us || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { decisions: [...kept, ...added].sort(byStart), suppressed };
}
