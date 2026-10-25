// Временной проход пробы (S15b) с одним повтором при падении страницы (S17b): renderFrames
// открывает новые страницы на каждый вызов, поэтому повтор — тот же проход заново. Строки лога
// читает QA сервера (`parseSweep`, `scriptSceneIssues`): кадры пробы до `[sweep-retry]` —
// оборванный проход, их не считают; `[sweep-error]` — проход не выполнен (warning temporal_skipped).

/** Маркер «первый проход упал, начат повтор» (с причиной). */
export const SWEEP_RETRY_TAG = "[sweep-retry]";
/** Проход не выполнен (с причиной): превью и кадры есть, проверок по всей сцене нет. */
export const SWEEP_ERROR_TAG = "[sweep-error]";
/** Падение страницы Chrome: «Page crashed!» Puppeteer и закрытая цель/сессия. */
export const PAGE_CRASH = /Page crashed|Target closed|Session closed/i;

const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0]!;

/**
 * Проход `pass`; падение страницы — один повтор. Сбой прохода не бросает: превью уже готово,
 * QA по времени без данных пометит пропуск. `ok` — с первого раза, `retried` — со второго.
 */
export async function runSweep(pass: () => Promise<unknown>, log: (line: string) => void): Promise<"ok" | "retried" | "failed"> {
  try {
    await pass();
    return "ok";
  } catch (e) {
    const why = firstLine(e);
    if (!PAGE_CRASH.test(why)) {
      log(`${SWEEP_ERROR_TAG} ${why}`);
      return "failed";
    }
    log(`${SWEEP_RETRY_TAG} ${why}`);
  }
  try {
    await pass();
    return "retried";
  } catch (e) {
    log(`${SWEEP_ERROR_TAG} повтор: ${firstLine(e)}`);
    return "failed";
  }
}
