// Лимиты по умолчанию (`03` §8). В Task 20 раннер получает их из `config.limits` (M12).
export const LEASE_MS = 30_000;
export const HEARTBEAT_MS = 10_000;
export const POLL_MS = 500;
export const MAX_RUNNING = 2;
export const AGENT_CALLS = 2;
export const RENDERS = 1;
/** Тяжёлые локальные модели (ASR) — по одной (ruling V8). */
export const HEAVY = 1;
export const MAX_ATTEMPTS = 3;
