// Env дочерних процессов агентов — только allowlist (03-target-architecture.md §6).
// HOME/USER нужны CLI для входа через Keychain; токенов и ключей здесь нет.
const ALLOWED = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TMPDIR"] as const;

/**
 * `tmpdir` — TMPDIR вызова в хранилище (`<root>/run/tmp/<runId>-a<attempt>-<role>-*`), как у
 * рендера: временные файлы агента не ложатся на системный диск. Без него (doctor,
 * `--version` вне прогона) остаётся TMPDIR родителя.
 */
export function childEnv(parent: NodeJS.ProcessEnv, tmpdir?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ALLOWED) {
    const v = parent[key];
    if (v !== undefined) env[key] = v;
  }
  if (tmpdir !== undefined) env.TMPDIR = tmpdir;
  return env;
}
