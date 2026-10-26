// Параллельность Remotion (Task 49a): половина ядер, 1..4; `render.concurrency` — явно.
import { afterEach, expect, it } from "vitest";
import { availableParallelism } from "node:os";
import { configureRenderConcurrency, currentRenderConcurrency, renderConcurrency } from "@ms/render";

afterEach(() => configureRenderConcurrency(undefined));

it("renderConcurrency: по ядрам и из конфигурации", () => {
  expect(renderConcurrency(10)).toBe(4);
  expect(renderConcurrency(2)).toBe(1);
  expect(renderConcurrency(1)).toBe(1);
  expect(renderConcurrency(6)).toBe(3);
  expect(renderConcurrency(10, 2)).toBe(2);
});

it("процесс берёт render.concurrency, без него — по ядрам; неверное значение — отказ", () => {
  expect(currentRenderConcurrency()).toBe(renderConcurrency(availableParallelism()));
  configureRenderConcurrency(7);
  expect(currentRenderConcurrency()).toBe(7);
  expect(() => configureRenderConcurrency(0)).toThrow(/render.concurrency/);
});
