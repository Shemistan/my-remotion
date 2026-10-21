import type { KnowledgeRef, VersionManifest } from "@ms/contracts";
import type { Db } from "../open.js";

/** Полная ссылка (`knowledge-refs.json`) или краткая из manifest (у версий без файла). */
export type KnowledgeRefInsert = KnowledgeRef | VersionManifest["knowledge_refs"][number];

export function insertMany(db: Db, versionId: string, refs: readonly KnowledgeRefInsert[]): void {
  const st = db.prepare(`INSERT INTO knowledge_refs (version_id, kb_id, repo, "commit", license, license_class, strategy, source_paths_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of refs) {
    const full = "repository" in r ? r : undefined;
    st.run(versionId, r.kb_id, full?.repository ?? null, r.commit, r.license, full?.license_class ?? null, r.strategy,
      full ? JSON.stringify(full.source_paths) : null);
  }
}
