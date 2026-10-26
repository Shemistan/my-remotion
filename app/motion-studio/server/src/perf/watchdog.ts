// Сторож прогресса (Task 49a). Попытка, которая дольше порога своего типа не вызывает
// `ctx.progress()` и не пишет событий (`ctx.emit`), считается зависшей: раннер прерывает её
// (abort, процессы — как при отмене) и пишет `failed(stalled)`. Повтор — действием человека
// (ADR 0007: failed не повторяется сам).
//
// Пороги — по типам задач: сторож ловит зависший обработчик, а не долгую работу. Поэтому
// умолчание каждого типа больше самого долгого законного молчания в нём: вызов агента без
// событий идёт до `agents.<роль>.timeoutMs`, экспорт сцены — до `EXPORT_TIMEOUT_MS`, ASR молчит
// до `asr.noOutputTimeoutMs` (воркер сам убивается раньше), финальный рендер — до
// `final.timeoutMs` (сборка master перед ним молчанием не считается: тики `-progress` ffmpeg,
// и свой таймаут у неё тот же `final.timeoutMs`). Ожидание места в семафоре (очередь агентов, рендеров, ASR) молчанием не
// считается. `watchdog.noProgressMs` из config.json заменяет умолчание своего типа.
import type { JobType } from "@ms/contracts";
import { JobTypeSchema } from "@ms/contracts";
import { EXPORT_TIMEOUT_MS } from "@ms/render";
import type { AppConfig } from "../config.js";

/** Запас сверх самого долгого законного молчания этапа. */
export const WATCHDOG_MARGIN_MS = 10 * 60_000;
/** Нижняя граница порога любого типа. */
export const WATCHDOG_MIN_MS = 45 * 60_000;

export type NoProgressLimits = Partial<Record<JobType, number>>;

/**
 * Пороги сторожа по типам: умолчания из конфигурации таймаутов (см. шапку) поверх
 * `watchdog.noProgressMs`. Типов без порога нет: у каждого — хотя бы `WATCHDOG_MIN_MS`.
 */
export function noProgressLimits(cfg: Pick<AppConfig, "agents" | "asr" | "final" | "watchdog">): NoProgressLimits {
  const agentMax = Math.max(0, ...Object.values(cfg.agents).map((a) => a.timeoutMs));
  const base = Math.max(WATCHDOG_MIN_MS, agentMax + WATCHDOG_MARGIN_MS, EXPORT_TIMEOUT_MS + WATCHDOG_MARGIN_MS);
  const out: NoProgressLimits = {};
  for (const t of JobTypeSchema.options) out[t] = base;
  out["asr.transcribe"] = Math.max(base, cfg.asr.noOutputTimeoutMs + WATCHDOG_MARGIN_MS);
  out["final.render"] = Math.max(base, cfg.final.timeoutMs + WATCHDOG_MARGIN_MS);
  out["final.reproduce"] = Math.max(base, cfg.final.timeoutMs + WATCHDOG_MARGIN_MS);
  return { ...out, ...(cfg.watchdog.noProgressMs as NoProgressLimits) };
}

/** Период проверки попытки: четверть порога, но не чаще 25 мс и не реже 30 с. */
export function watchdogPeriodMs(limitMs: number): number {
  return Math.min(30_000, Math.max(25, Math.floor(limitMs / 4)));
}

/**
 * Пульс одной попытки: `beat()` на каждом прогрессе и событии; `wait()`/`resume()` — вокруг
 * ожидания места в семафоре (вложенные ожидания считаются). `stalledFor(now)` — сколько мс
 * попытка молчит сверх порога (`undefined` — не молчит или ждёт место).
 */
export class ProgressPulse {
  private last: number;
  private waiting = 0;

  constructor(
    readonly limitMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.last = now();
  }

  beat(): void {
    this.last = this.now();
  }

  wait(): void {
    this.waiting++;
  }

  resume(): void {
    this.waiting = Math.max(0, this.waiting - 1);
    this.beat();
  }

  /** Молчание дольше порога (мс молчания) или `undefined`. */
  stalled(): number | undefined {
    if (this.waiting > 0) return undefined;
    const silent = this.now() - this.last;
    return silent > this.limitMs ? silent : undefined;
  }
}
