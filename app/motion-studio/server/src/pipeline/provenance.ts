// Provenance-gate (Global Constraints): сторонний код в сцене — только из записей KB,
// выбранных Director и записанных в `knowledge-refs.json`, и только `permissive` (иначе —
// с явным разрешением пользователя). Нарушение — blocking: Engineer исправляет.
import type { EngineerReport, KnowledgeRef, QAIssue } from "@ms/contracts";
import type { KnowledgeSource } from "./refs.js";

export function provenanceGate(
  report: EngineerReport,
  refs: KnowledgeRef[],
  kb: Pick<KnowledgeSource, "getCapability">,
  allowRestricted: boolean,
): QAIssue[] {
  const out: QAIssue[] = [];
  const allowed = new Set(refs.map((r) => r.kb_id));
  for (const id of [...new Set(report.kb_ids_used)]) {
    if (!allowed.has(id)) {
      out.push({
        source: "technical", code: "provenance", severity: "blocking", area: id,
        description: `kb_ids_used содержит ${id}, которого нет в knowledge-refs.json: код без записанного происхождения`,
        fix_hint: `убери из сцены код и идею ${id} (и из kb_ids_used) или используй только записи из knowledge-refs.json: ${[...allowed].join(", ") || "—"}`,
      });
      continue;
    }
    const license = kb.getCapability(id)?.license_class ?? refs.find((r) => r.kb_id === id)!.license_class;
    if (license !== "permissive" && !allowRestricted) {
      out.push({
        source: "technical", code: "license", severity: "blocking", area: id,
        description: `${id}: лицензия ${license}, без разрешения пользователя допустим только permissive`,
        fix_hint: `не используй код ${id}: построй элемент на motion-kit`,
      });
    }
  }
  return out;
}
