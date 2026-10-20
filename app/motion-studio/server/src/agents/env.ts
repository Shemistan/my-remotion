// Env дочерних процессов агентов — только allowlist (03-target-architecture.md §6).
// HOME/USER нужны CLI для входа через Keychain; токенов и ключей здесь нет.
const ALLOWED = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TMPDIR"] as const;

export function childEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ALLOWED) {
    const v = parent[key];
    if (v !== undefined) env[key] = v;
  }
  return env;
}
