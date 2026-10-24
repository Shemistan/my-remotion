// Маскировка путей в ответах API (ревью Task 29): только по границе пути — хранилище и
// домашний каталог как целые сегменты; соседние каталоги с тем же префиксом не трогаются.
import { expect, it } from "vitest";
import { maskDeep, maskPaths } from "../../src/api/job-dto.js";

const ROOT = "/Volumes/External SSD/MotionStudio";
const HOME = "/Users/x";

it("maskPaths: хранилище → «хранилище», дом → «~», только целые сегменты", () => {
  expect(maskPaths(`${ROOT}/workspace/a.mp4`, ROOT, HOME)).toBe("хранилище/workspace/a.mp4");
  expect(maskPaths(`${HOME}/Movies/a.mov и ${HOME}`, ROOT, HOME)).toBe("~/Movies/a.mov и ~");
  expect(maskPaths(`'${HOME}'`, ROOT, HOME)).toBe("'~'");
  expect(maskPaths("/Users/x2/Movies/a.mov", ROOT, HOME)).toBe("/Users/x2/Movies/a.mov");
  expect(maskPaths(`${ROOT}2/a.mp4 /Users/xy`, ROOT, HOME)).toBe(`${ROOT}2/a.mp4 /Users/xy`);
  // хранилище внутри дома — сначала хранилище
  expect(maskPaths(`${HOME}/store/db`, `${HOME}/store`, HOME)).toBe("хранилище/db");
});

it("maskDeep: рекурсивно по строкам объектов и массивов, прочее как есть", () => {
  const v = { a: `${HOME}/a`, n: 3, b: [{ c: `${ROOT}/x` }, null, true], d: { e: "/Users/x2" } };
  expect(maskDeep(v, ROOT, HOME)).toEqual({ a: "~/a", n: 3, b: [{ c: "хранилище/x" }, null, true], d: { e: "/Users/x2" } });
  expect(maskDeep(undefined, ROOT, HOME)).toBeUndefined();
});
