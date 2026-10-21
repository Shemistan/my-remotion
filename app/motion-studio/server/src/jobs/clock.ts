/** Источник времени раннера и очереди (мс эпохи); в тестах — фейковый. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
