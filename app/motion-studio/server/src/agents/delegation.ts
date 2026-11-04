// Политика делегирования в Codex (спека 2026-11-04-codex-delegation-design.md §2): веса ролей,
// план долей по уровню, решение для вызова, статистика «чистоты» и авто-пауза роли.
// Модуль без ввода-вывода, кроме `DelegationState.load/save` (JSON в хранилище).
import { readFile, rename, writeFile } from "node:fs/promises";
import { ROLES, type Role } from "./runtime.js";

/** Роли в порядке риска для качества: первыми уходят в Codex структурные. */
export const DELEGATION_ORDER: readonly Role[] = [
  "fragment_fit", "footage_analyst", "rough_cut_editor", "edit_planner", "concept",
  "semantic_director", "script_director", "visual_planner",
  "engineer",
  "motion_director",
];
/** Всегда Claude: судья не должен совпадать с исполнителем. */
export const ALWAYS_CLAUDE: readonly Role[] = ["visual_qa"];
/** Без проверки качества: в безопасный максимум только с `allowUnverified`. */
export const UNVERIFIED: readonly Role[] = ["motion_director"];
/** Роли, у которых «чистота» — отсутствие вызовов-исправлений в прогоне, а не успех вызова. */
export const FIX_TRACKED: readonly Role[] = ["engineer"];
/** Номер вызова, с которого engineer — исправление (`steps.ts`: `seq: first ? call : 100 + call`). */
export const FIX_SEQ = 100;

/** Доли стоимости Claude по ролям (база студии, 2026-11-04) — пока нет своей истории. */
export const DEFAULT_WEIGHTS: Record<Role, number> = {
  engineer: 0.619, motion_director: 0.274, visual_qa: 0.097, concept: 0.01, edit_planner: 0.001,
  rough_cut_editor: 0.001, footage_analyst: 0.001, semantic_director: 0.001, visual_planner: 0.001,
  script_director: 0.001, fragment_fit: 0.0005,
};

/** Нормирует веса (сумма 1); пустая или нулевая история — `DEFAULT_WEIGHTS`. */
export function normalizeWeights(raw: Partial<Record<Role, number>>): Record<Role, number> {
  const total = ROLES.reduce((s, r) => s + Math.max(0, raw[r] ?? 0), 0);
  const src = total > 0 ? raw : DEFAULT_WEIGHTS;
  const sum = total > 0 ? total : ROLES.reduce((s, r) => s + DEFAULT_WEIGHTS[r], 0);
  return Object.fromEntries(ROLES.map((r) => [r, Math.max(0, src[r] ?? 0) / sum])) as Record<Role, number>;
}

export interface DelegationPolicy {
  enabled: boolean;
  /** Целевая доля работы для Codex, 0–100. */
  level: number;
  allowUnverified: boolean;
}

export interface DelegationPlan {
  /** Доля вызовов роли, уходящих в Codex, 0–1. */
  shares: Record<Role, number>;
  /** Фактический уровень плана (≤ запрошенного и ≤ максимума), %. */
  level: number;
  /** Минимальный ненулевой уровень: первая доступная роль целиком, %. */
  minLevel: number;
  /** Безопасный максимум: сумма весов доступных ролей, %. */
  maxLevel: number;
  /** Доступные роли по порядку. */
  eligible: Role[];
}

/** Роли, которые сейчас можно отдавать в Codex (порядок `DELEGATION_ORDER`). */
export function eligibleRoles(policy: Pick<DelegationPolicy, "allowUnverified">, paused: ReadonlySet<Role>): Role[] {
  return DELEGATION_ORDER.filter((r) => !ALWAYS_CLAUDE.includes(r) && !paused.has(r) && (policy.allowUnverified || !UNVERIFIED.includes(r)));
}

const pct = (x: number) => Math.round(x * 10_000) / 100;

/**
 * План долей: роли по порядку заполняются целиком, пока сумма весов не достигнет уровня;
 * последняя — частично. Выключено или уровень 0 — все доли 0.
 */
export function planShares(weights: Record<Role, number>, policy: DelegationPolicy, paused: ReadonlySet<Role> = new Set()): DelegationPlan {
  const eligible = eligibleRoles(policy, paused);
  const shares = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  const maxW = eligible.reduce((s, r) => s + weights[r], 0);
  const minW = eligible.find((r) => weights[r] > 0);
  let left = policy.enabled ? Math.min(Math.max(0, policy.level) / 100, maxW) : 0;
  let taken = 0;
  for (const r of eligible) {
    if (left <= 1e-12) break;
    const w = weights[r];
    if (w <= 0) continue;
    const f = Math.min(1, left / w);
    shares[r] = f;
    taken += f * w;
    left -= f * w;
  }
  return { shares, level: pct(taken), minLevel: minW ? pct(weights[minW]) : 0, maxLevel: pct(maxW), eligible };
}

/** FNV-1a 32 бит: детерминированное и равномерное «бросание монеты» по ключу вызова. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Уходит ли вызов в Codex при доле `share`: решение повторяемо для одного ключа. */
export function pickCodex(key: string, share: number): boolean {
  if (share <= 0) return false;
  if (share >= 1) return true;
  return hash32(key) / 2 ** 32 < share;
}

// --- Статистика и авто-пауза ---

export type Runtime = "codex" | "claude";

export interface Outcome {
  runtime: Runtime;
  /** Ключ прогона `<runId>-a<attempt>`: исправление в нём портит все первые вызовы роли. */
  run: string;
  clean: boolean;
  at: number;
}

export interface RoleStats {
  codex: { n: number; clean: number };
  claude: { n: number; clean: number };
}

export const STATS_WINDOW = 20;
export const PAUSE_MIN_N = 8;
export const PAUSE_GAP = 0.15;
/** Исход первого вызова engineer окончателен, когда прогон точно закончился. */
export const SETTLE_MS = 60 * 60_000;

export interface PauseInfo {
  reason: string;
  at: string;
}

interface StateFile {
  outcomes: Partial<Record<Role, Outcome[]>>;
  paused: Partial<Record<Role, PauseInfo>>;
}

/** Исходы вызовов и паузы ролей; переживают перезапуск (`<root>/delegation-state.json`). */
export class DelegationState {
  private outcomes: Partial<Record<Role, Outcome[]>> = {};
  private paused: Partial<Record<Role, PauseInfo>> = {};
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly path?: string, private readonly now: () => number = Date.now) {}

  async load(): Promise<void> {
    if (!this.path) return;
    try {
      const j = JSON.parse(await readFile(this.path, "utf8")) as StateFile;
      this.outcomes = j.outcomes ?? {};
      this.paused = j.paused ?? {};
    } catch {
      // файла нет или он испорчен — начинаем с чистого листа
    }
  }

  /** Запись в фоне, последовательно; сбой записи не роняет вызов агента. */
  private save(): void {
    if (!this.path) return;
    const path = this.path;
    const body = JSON.stringify({ outcomes: this.outcomes, paused: this.paused } satisfies StateFile, null, 2) + "\n";
    this.writing = this.writing.then(async () => {
      const tmp = `${path}.tmp-${process.pid}`;
      await writeFile(tmp, body);
      await rename(tmp, path);
    }).catch(() => undefined);
  }

  /** Дождаться фоновой записи (тесты, остановка). */
  flush(): Promise<void> {
    return this.writing;
  }

  pausedRoles(): Set<Role> {
    return new Set(Object.keys(this.paused) as Role[]);
  }

  pauses(): Partial<Record<Role, PauseInfo>> {
    return { ...this.paused };
  }

  resume(role: Role): void {
    delete this.paused[role];
    // старые исходы Codex не должны сразу вернуть паузу
    this.outcomes[role] = (this.outcomes[role] ?? []).filter((o) => o.runtime !== "codex");
    this.save();
  }

  /** Исход первого вызова роли. */
  record(role: Role, o: Omit<Outcome, "at">): void {
    const list = (this.outcomes[role] ??= []);
    list.push({ ...o, at: this.now() });
    // окно по каждому рантайму, с запасом на ещё не устоявшиеся
    const keep = (rt: Runtime) => list.filter((x) => x.runtime === rt).slice(-STATS_WINDOW * 2);
    this.outcomes[role] = [...keep("codex"), ...keep("claude")].sort((a, b) => a.at - b.at);
    this.check(role);
    this.save();
  }

  /** Исправление в прогоне: первые вызовы роли в нём — не чистые. */
  markFixed(role: Role, run: string): void {
    let changed = false;
    for (const o of this.outcomes[role] ?? []) {
      if (o.run === run && o.clean) {
        o.clean = false;
        changed = true;
      }
    }
    if (changed) {
      this.check(role);
      this.save();
    }
  }

  /**
   * Окно последних устоявшихся исходов. У engineer исход устоялся, если он уже не чистый или
   * прошло `SETTLE_MS` (исправления в прогоне больше не придут).
   */
  stats(role: Role): RoleStats {
    const t = this.now();
    const settled = (this.outcomes[role] ?? []).filter((o) => !FIX_TRACKED.includes(role) || !o.clean || t - o.at >= SETTLE_MS);
    const win = (rt: Runtime) => {
      const l = settled.filter((o) => o.runtime === rt).slice(-STATS_WINDOW);
      return { n: l.length, clean: l.filter((o) => o.clean).length };
    };
    return { codex: win("codex"), claude: win("claude") };
  }

  private check(role: Role): void {
    if (this.paused[role]) return;
    const why = pauseReason(this.stats(role));
    if (why) this.paused[role] = { reason: why, at: new Date(this.now()).toISOString() };
  }
}

/** Причина авто-паузы или `undefined`: Codex хуже Claude больше чем на `PAUSE_GAP`. */
export function pauseReason(s: RoleStats): string | undefined {
  if (s.codex.n < PAUSE_MIN_N) return undefined;
  const codex = s.codex.clean / s.codex.n;
  // нет базы Claude — сравниваем с порогом 85 % (типичная чистота Claude)
  const claude = s.claude.n >= PAUSE_MIN_N ? s.claude.clean / s.claude.n : 0.85;
  if (claude - codex <= PAUSE_GAP) return undefined;
  return `Codex: ${Math.round(codex * 100)} % чистых из ${s.codex.n}, Claude: ${Math.round(claude * 100)} %`;
}
