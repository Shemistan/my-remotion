// Лимиты по умолчанию (`03` §8). В Task 20 раннер получает их из `config.limits` (M12).
export const LEASE_MS = 30_000;
export const HEARTBEAT_MS = 10_000;
export const POLL_MS = 500;
export const MAX_RUNNING = 5;
/**
 * Одновременных вызовов агентов на раннер (S5: дубли и сцены параллельно, 4–6). Агенты —
 * облачные вызовы; локально они почти не нагружают Mac.
 */
export const AGENT_CALLS = 10;
/** Одновременных рендеров (S5: 2–3): Chrome рендера тяжёлый, бандлы — в общем кэше по ключу содержимого. */
export const RENDERS = 3;
/** Тяжёлые локальные модели (ASR) — по одной (ruling V8). */
export const HEAVY = 1;
export const MAX_ATTEMPTS = 3;
