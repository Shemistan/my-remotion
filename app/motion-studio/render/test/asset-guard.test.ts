import { createServer } from "node:http";
import { createRequire } from "node:module";
import { type AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { type AssetPolicy, assetBlockReason, blockingOnDownload, installAssetGuard } from "../src/node/asset-guard.ts";
import { makeTmp, removeTmp } from "./helpers.js";

const policy: AssetPolicy = { bundlePort: 3123, roots: ["/data/ms/cache/bundles/k", "/data/ms"] };
const blocked = (src: string) => assetBlockReason(src, policy) !== null;

describe("assetBlockReason", () => {
  it.each([
    "http://localhost:3123/static-abc/dot.png",
    "http://127.0.0.1:3123/static-abc/clip.mp4",
    "data:image/png;base64,AAAA",
    "same-as-asset-1-0",
    "file:///data/ms/media/a.mp4",
    "/data/ms/media/a.mp4",
    "/data/ms/cache/bundles/k/static/a.mp3",
  ])("пропускает %s", (src) => expect(assetBlockReason(src, policy)).toBeNull());

  it.each([
    "http://127.0.0.1:8790/api/projects",
    "http://localhost:8790/x",
    "http://[::1]:3123/x",
    "http://0.0.0.0:3123/x",
    "http://localhost.evil.com:3123/x",
    "https://localhost:3123/x",
    "https://example.com/a.png",
    "http://1.1.1.1/",
    "http://user:pw@localhost:3123/x",
    "http://localhost:3123/proxy?src=http%3A%2F%2F127.0.0.1%3A8790%2F",
    "http://localhost:3123/%70roxy?src=x",
    "ftp://localhost:3123/x",
    "file:///etc/passwd",
    "file:///data/ms/../../etc/passwd",
    "/etc/passwd",
    "/data/msx/a.mp4",
    "relative/a.png",
    "",
  ])("блокирует %s", (src) => expect(blocked(src)).toBe(true));
});

describe("blockingOnDownload", () => {
  it("бросает на запрещённом src и молчит на разрешённом", () => {
    const h = blockingOnDownload(policy);
    expect(() => h("http://127.0.0.1:8790/x")).toThrow(/ассет заблокирован/);
    expect(h("http://localhost:3123/static/a.png")).toBeUndefined();
  });
});

describe("installAssetGuard", () => {
  let uninstall: (() => void) | undefined;
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    uninstall?.();
    uninstall = undefined;
    for (const c of cleanups.splice(0)) await c();
  });

  it("downloadAsset Remotion отказывает без запроса в сеть; разрешённое качает", async () => {
    let hits = 0;
    const server = createServer((_req, res) => {
      hits++;
      res.setHeader("content-type", "text/plain");
      res.end("ok");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;
    try {
      uninstall = installAssetGuard({ bundlePort: port, roots: [] });
      const require = createRequire(import.meta.url);
      const mod = require(join(dirname(require.resolve("@remotion/renderer")), "assets", "download-and-map-assets-to-file.js")) as {
        downloadAsset: (o: object) => Promise<string>;
      };
      const { RenderInternals } = require("@remotion/renderer") as { RenderInternals: { makeDownloadMap: () => unknown } };
      // временные файлы Remotion — в tmp/ репозитория, не в системный TMPDIR
      const tmp = await makeTmp();
      cleanups.push(() => removeTmp(tmp));
      const prevTmp = process.env.TMPDIR;
      process.env.TMPDIR = tmp;
      const downloadMap = RenderInternals.makeDownloadMap();
      if (prevTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = prevTmp;
      const call = (src: string) =>
        mod.downloadAsset({ src, downloadMap, indent: false, logLevel: "error", binariesDirectory: null, shouldAnalyzeAudioImmediately: false });
      // другой порт того же хоста — как Control API
      const other = createServer((_req, res) => {
        hits++;
        res.end("ok");
      });
      await new Promise<void>((r) => other.listen(0, "127.0.0.1", () => r()));
      const otherPort = (other.address() as AddressInfo).port;
      try {
        await expect(call(`http://127.0.0.1:${otherPort}/x.txt`)).rejects.toThrow(/ассет заблокирован/);
        await expect(call(`http://127.0.0.1:${port}/proxy?src=x`)).rejects.toThrow(/ассет заблокирован/);
        expect(hits).toBe(0);
        // сервер бандла (тот же порт) — разрешён
        const to = await call(`http://127.0.0.1:${port}/static/a.txt`);
        expect(to).toMatch(/\.txt$/);
        expect(hits).toBe(1);
      } finally {
        await new Promise((r) => other.close(r));
      }
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it("путь к модулю совпадает с тем, что грузит index Remotion (один экземпляр)", () => {
    const require = createRequire(import.meta.url);
    const index = require.resolve("@remotion/renderer");
    require(index);
    const path = join(dirname(index), "assets", "download-and-map-assets-to-file.js");
    expect(Object.keys(require.cache)).toContain(path);
    expect(pathToFileURL(path).href).toMatch(/download-and-map-assets-to-file\.js$/);
  });
});
