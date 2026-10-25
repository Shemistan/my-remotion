// Раунды Engineer по кодам blocking для smoke json (ревью S15b, M-2): счёт по дублям занижал
// цену кода — у сцены с одним QA-дублем и тремя вызовами Engineer код получал «1».

/** pipeline-log.json версии: то, что нужно для счёта раундов. */
export interface PipelineLogRounds {
  engineer_calls?: number;
  attempts?: { take?: number; call?: number; blocking: string[] }[];
  timings?: Record<string, number>;
}

export interface Rounds {
  engineer_calls: number;
  attempts: number;
  /** Вызовы Engineer, потраченные на исправление после QA с этим blocking (вместе с починкой typecheck/рендера этой правки). */
  engineer_rounds_by_code: Record<string, number>;
  /** QA-дубли с этим blocking (справочно, прежняя мерка). */
  attempts_by_code: Record<string, number>;
}

/**
 * Раунд Engineer «на код»: вызов Engineer того же дубля после QA-попытки, где код был blocking,
 * до следующей QA-попытки включительно (правка и её починка typecheck/рендера). Вызовы берутся из
 * `timings` (`engineer_N`, у дубля 2 — `t2_engineer_N`).
 */
export function roundsByCode(pl: PipelineLogRounds): Rounds {
  const attempts = pl.attempts ?? [];
  const calls = (take: number) => Object.keys(pl.timings ?? {}).flatMap((k) => {
    const m = /^(t2_)?engineer_(\d+)$/.exec(k);
    return m && (m[1] ? 2 : 1) === take ? [Number(m[2])] : [];
  });
  const rounds: Record<string, number> = {};
  const byAttempt: Record<string, number> = {};
  for (const a of attempts) for (const c of new Set(a.blocking)) byAttempt[c] = (byAttempt[c] ?? 0) + 1;
  for (const take of [1, 2]) {
    const own = attempts.filter((a) => (a.take ?? 1) === take && a.call !== undefined).sort((a, b) => a.call! - b.call!);
    const eng = calls(take);
    own.forEach((a, k) => {
      if (a.blocking.length === 0) return;
      const next = own[k + 1]?.call ?? Number.POSITIVE_INFINITY;
      const n = eng.filter((c) => c > a.call! && c <= next).length;
      if (n === 0) return;
      for (const c of new Set(a.blocking)) rounds[c] = (rounds[c] ?? 0) + n;
    });
  }
  return { engineer_calls: pl.engineer_calls ?? 0, attempts: attempts.length, engineer_rounds_by_code: rounds, attempts_by_code: byAttempt };
}
