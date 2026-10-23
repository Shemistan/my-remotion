// Range для превью и экспорта: 206 + Content-Range, Accept-Ranges, 416 вне файла.
import { afterEach, beforeEach, expect, it } from "vitest";
import { parseRange } from "../../src/api/range.js";
import { type Api, getHeaders, makeApi, seedVersion } from "./helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(() => api.close());

it("parseRange: одиночный диапазон, хвост, открытый конец; мусор и вне файла", () => {
  expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
  expect(parseRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
  expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
  expect(parseRange("bytes=990-2000", 1000)).toEqual({ start: 990, end: 999 });
  expect(parseRange("bytes=1000-", 1000)).toBe("unsatisfiable");
  expect(parseRange("bytes=5-1", 1000)).toBe("unsatisfiable");
  expect(parseRange("bytes=-0", 1000)).toBe("unsatisfiable");
  expect(parseRange("items=0-1", 1000)).toBeUndefined();
  expect(parseRange("bytes=0-1,5-6", 1000)).toBeUndefined(); // несколько — отдаём весь файл
  expect(parseRange(undefined, 1000)).toBeUndefined();
});

it("GET preview.mp4: Range → 206 c Content-Range; без Range — 200 целиком; вне файла — 416", async () => {
  const { versionId, preview } = await seedVersion(api, { previewBytes: 1000 });
  const url = `/api/versions/${versionId}/preview.mp4`;
  const r = await api.inj("GET", url, { ...getHeaders, range: "bytes=0-99" });
  expect(r.statusCode).toBe(206);
  expect(r.headers["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
  expect(r.headers["content-range"]).toBe("bytes 0-99/1000");
  expect(r.headers["accept-ranges"]).toBe("bytes");
  expect(r.headers["content-type"]).toBe("video/mp4");
  expect(r.rawPayload.length).toBe(100);
  const full = await api.inj("GET", url, getHeaders);
  expect(full.statusCode).toBe(200);
  expect(full.headers["accept-ranges"]).toBe("bytes");
  expect(full.headers["content-length"]).toBe("1000");
  expect(full.rawPayload.toString()).toBe(preview);
  const tail = await api.inj("GET", url, { ...getHeaders, range: "bytes=-10" });
  expect(tail.headers["content-range"]).toBe("bytes 990-999/1000");
  const out = await api.inj("GET", url, { ...getHeaders, range: "bytes=5000-" });
  expect(out.statusCode).toBe(416);
  expect(out.headers["content-range"]).toBe("bytes */1000");
  const frame = await api.inj("GET", `/api/versions/${versionId}/frames/0.png`, getHeaders);
  expect(frame.headers["content-type"]).toBe("image/png");
});

it("HEAD preview.mp4: Content-Length — размер файла (и диапазона), тела нет", async () => {
  const { versionId } = await seedVersion(api, { previewBytes: 1000 });
  const url = `/api/versions/${versionId}/preview.mp4`;
  const h = await api.inj("HEAD", url, getHeaders);
  expect(h.statusCode).toBe(200);
  expect(h.headers["content-length"]).toBe("1000");
  expect(h.headers["accept-ranges"]).toBe("bytes");
  expect(h.rawPayload.length).toBe(0);
  const hr = await api.inj("HEAD", url, { ...getHeaders, range: "bytes=0-9" });
  expect(hr.statusCode).toBe(206);
  expect(hr.headers["content-length"]).toBe("10");
  expect(hr.headers["content-range"]).toBe("bytes 0-9/1000");
  expect(hr.rawPayload.length).toBe(0);
});
