// Типы KnowledgeAdapter. Имена полей CapabilityView — по docs/architecture/02-integration-map.md §4.1.

export type LicenseClass = "permissive" | "restricted" | "unknown";
export type Confidence = "medium" | "low" | "unknown";
export type CompatibilityStatus = "native" | "adaptable" | "complex" | "unsuitable" | "unknown";

export interface CapabilityView {
  id: string;
  name: string;
  kind: string;
  category: string;
  visualizes: string;
  use_when: string;
  inputs: string;
  adaptations: string;
  patterns: string[];
  compat_flags: string[];
  repository: string;
  repository_url: string;
  commit: string;
  license: string;
  license_class: LicenseClass;
  /** Пути относительно корня исходников (KB_SOURCE_ROOT). */
  source_paths: string[];
  documentation_paths: string[];
  compatibility_status: CompatibilityStatus;
  tested_status: string;
  confidence: Confidence;
  /** Путь карточки относительно корня knowledge/. */
  card_path: string;
}

export interface SearchFilters {
  /** По умолчанию ["native", "adaptable"]. */
  compat?: CompatibilityStatus[];
  kinds?: string[];
  patterns?: string[];
  /** По умолчанию false: только permissive. */
  allowRestricted?: boolean;
}

export interface SearchHit {
  view: CapabilityView;
  score: number;
  matched: string[];
}

export interface SourceReference {
  path: string;
  /** Пустая строка, если путь недопустим (invalid). */
  absPath: string;
  exists: boolean;
  /** Путь вне корня исходников, симлинк или не файл: exists всегда false. */
  invalid?: boolean;
  reason?: string;
}

/**
 * Строка knowledge/compatibility/results.jsonl (формат — knowledge/compatibility/rules.md,
 * «Как фиксировать проверку»; tools/kb.py требует только id). Адаптер читает `id` и `result`:
 * "ok" -> tested_status "rendered-ok", "fail" -> "rendered-fail"; при нескольких строках с одним id
 * побеждает последняя. Остальные поля справочные.
 */
export interface ResultRecord {
  id: string;
  result: "ok" | "fail";
  date?: string;
  remotion?: string;
  how?: string;
  notes?: string;
}

export interface CopyResult {
  id: string;
  copied: string[];
  missing: string[];
}
