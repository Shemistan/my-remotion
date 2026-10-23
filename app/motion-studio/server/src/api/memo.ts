/** Кэш результата асинхронной функции на процесс: успех запоминается, отказ — нет (следующий вызов повторит). */
export function memoOnSuccess<T>(fn: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => {
    if (!cached) {
      const p = fn();
      cached = p;
      p.catch(() => {
        if (cached === p) cached = undefined;
      });
    }
    return cached;
  };
}
