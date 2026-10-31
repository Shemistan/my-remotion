// Готовый план ручной доработки версии по трём слабым осям Visual QA: Edit Planner не нужен.
import { type EditPlan, type QAReport, QA_SCORE_AXES } from "@ms/contracts";
import { fixHints } from "../qa/report.js";
import { AXIS_HINT } from "./fix-loop.js";
import { clip } from "./steps.js";

/** План правки кода по оценке опубликованной версии. */
export function planFromQa(qa: QAReport, baseVersionId: string): EditPlan {
  if (!qa.scores) throw new Error("no_scores: у версии нет оценки Visual QA");
  const axes = QA_SCORE_AXES.map((axis) => ({ axis, score: qa.scores![axis] }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
  const changes: EditPlan["changes"] = axes.map(({ axis, score }) => {
    const notes = (qa.score_notes ?? []).filter((x) => x.axis === axis).map((x) => `кадр ${x.frame}: ${x.note}`);
    return {
      target: axis,
      kind: "code",
      description: `поднять ${axis} (сейчас ${score}/10): ${AXIS_HINT[axis]}${notes.length > 0 ? `; видно: ${notes.join("; ")}` : ""}`,
    };
  });
  const issues = fixHints(qa);
  if (issues) changes.push({ target: "qa", kind: "code", description: clip(issues, 1500) });
  return {
    base_version_id: baseVersionId,
    path: "code",
    changes,
    borrow: [],
    preserve: ["timing"],
    reply: `Улучшаю сцену по осям ${axes.map((x) => x.axis).join(", ")} (текущая итоговая оценка ${qa.scores.overall}/10).`,
  };
}
