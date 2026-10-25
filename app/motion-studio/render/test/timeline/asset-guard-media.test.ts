// Task 36 (F9): `AssetPolicy.media` — Node-загрузки Remotion пропускают ровно origin медиасервера
// worker таймлайна и его токены; прочее (другой порт, чужой токен, учётные данные, query) — блок.
// Настоящий вызывающий downloadAsset (downloadAndMapAssetsToFileUrl, звук renderMedia) качает с
// медиасервера.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type AssetPolicy, assetBlockReason, installAssetGuard } from "../../src/node/asset-guard.ts";
import { serveMedia } from "../../src/timeline/media-server.ts";
import { makeTmp, removeTmp } from "../helpers.js";

const TOKEN = "a".repeat(32);
const policy: AssetPolicy = { bundlePort: 3123, media: { origin: "http://127.0.0.1:4555", tokens: new Set([TOKEN]) } };

describe("assetBlockReason с media", () => {
  it.each([
    `http://127.0.0.1:4555/${TOKEN}/master`,
    `http://127.0.0.1:4555/${TOKEN}/audio`,
    "http://localhost:3123/static-abc/dot.png",
  ])("пропускает %s", (src) => expect(assetBlockReason(src, policy)).toBeNull());

  it.each([
    `http://127.0.0.1:4555/${"b".repeat(32)}/master`,
    `http://127.0.0.1:4556/${TOKEN}/master`,
    `http://localhost:4555/${TOKEN}/master`,
    `https://127.0.0.1:4555/${TOKEN}/master`,
    `http://u:p@127.0.0.1:4555/${TOKEN}/master`,
    `http://127.0.0.1:4555/${TOKEN}/master?x=1`,
    `http://127.0.0.1:4555/${TOKEN}`,
    `http://127.0.0.1:4555/${TOKEN}/`,
    `http://127.0.0.1:4555/${TOKEN}/a/b`,
    `http://127.0.0.1:4555/${TOKEN}/..%2Fx`,
    "http://127.0.0.1:4555/",
    "http://127.0.0.1:8790/api/projects",
    "file:///data/master.mp4",
  ])("блокирует %s", (src) => expect(assetBlockReason(src, policy)).not.toBeNull());

  it("без media — прежнее поведение: медиасервер вне бандла", () => {
    expect(assetBlockReason(`http://127.0.0.1:4555/${TOKEN}/master`, { bundlePort: 3123 })).toBe("адрес вне сервера бандла");
  });
});

describe("installAssetGuard с media на настоящем вызывающем", () => {
  const cleanups: (() => unknown)[] = [];
  afterEach(async () => {
    for (const c of cleanups.splice(0).reverse()) await c();
  });

  it("политика с неверным origin отвергается при установке", () => {
    expect(() => installAssetGuard({ bundlePort: 1, media: { origin: "http://0.0.0.0:2", tokens: new Set([TOKEN]) } })).toThrow(/127\.0\.0\.1/);
    expect(() => installAssetGuard({ bundlePort: 1, media: { origin: "http://127.0.0.1:2/x", tokens: new Set([TOKEN]) } })).toThrow(/origin/);
    expect(() => installAssetGuard({ bundlePort: 1, media: { origin: "http://127.0.0.1:2", tokens: new Set(["x"]) } })).toThrow(/токен/);
  });

  it("downloadAndMapAssetsToFileUrl качает свой токен с медиасервера, чужой — блок", async () => {
    const tmp = await makeTmp();
    cleanups.push(() => removeTmp(tmp));
    await writeFile(join(tmp, "a.wav"), "RIFF-audio");
    const srv = await serveMedia({ audio: join(tmp, "a.wav") });
    cleanups.push(() => srv.close());
    const require = createRequire(import.meta.url);
    const DIST = dirname(require.resolve("@remotion/renderer"));
    const dl = require(join(DIST, "assets", "download-and-map-assets-to-file.js")) as { downloadAndMapAssetsToFileUrl: (o: object) => Promise<{ src: string }> };
    const { RenderInternals } = require("@remotion/renderer") as { RenderInternals: { makeDownloadMap: () => unknown } };
    const prev = process.env.TMPDIR;
    process.env.TMPDIR = tmp;
    const map = RenderInternals.makeDownloadMap();
    if (prev === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = prev;
    const args = (src: string) => ({
      renderAsset: { type: "audio", src, id: "a", frame: 0, volume: 1, mediaFrame: 0, playbackRate: 1, toneFrequency: 1, audioStartFrame: 0, audioStreamIndex: 0 },
      onDownload: () => undefined, downloadMap: map, logLevel: "error", indent: false, binariesDirectory: null, cancelSignalForAudioAnalysis: undefined,
      shouldAnalyzeAudioImmediately: false,
    });
    const blocked: string[] = [];
    cleanups.push(installAssetGuard({ bundlePort: 1, media: { origin: srv.origin, tokens: new Set([srv.token]) } }, (m) => blocked.push(m)));
    const got = await dl.downloadAndMapAssetsToFileUrl(args(srv.urlFor("audio")));
    expect(await readFile(got.src, "utf8")).toBe("RIFF-audio");
    await expect(dl.downloadAndMapAssetsToFileUrl(args(`${srv.origin}/${"0".repeat(32)}/audio`))).rejects.toThrow(/ассет заблокирован/);
    expect(blocked).toHaveLength(1);
  });
});
