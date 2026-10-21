// Защита Node-загрузок Remotion (asset-guard.ts). Не e2e: идёт в ./check и гоняет
// настоящих вызывающих downloadAsset из @remotion/renderer — listener /proxy
// (offthread-video-server) и downloadAndMapAssetsToFileUrl (звук renderMedia), — чтобы
// смена внутренностей Remotion не оставила защиту молча снятой.
import { type Server, createServer, get } from "node:http";
import { createRequire } from "node:module";
import { type AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AssetPolicy,
  PINNED_RENDERER,
  assertPinnedRenderer,
  assetBlockReason,
  blockingOnDownload,
  installAssetGuard,
} from "../src/node/asset-guard.ts";
import { makeTmp, removeTmp } from "./helpers.js";

const policy: AssetPolicy = { bundlePort: 3123 };
const blocked = (src: string) => assetBlockReason(src, policy) !== null;

describe("assetBlockReason", () => {
  it.each([
    "http://localhost:3123/static-abc/dot.png",
    "http://127.0.0.1:3123/static-abc/clip.mp4",
    "data:image/png;base64,AAAA",
    "same-as-asset-1-0",
    "same-as-audio-0.123-15",
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
    // путей на диске политика не пропускает (Phase 4/5 — media origin)
    "file:///data/ms/media/a.mp4",
    "/data/ms/media/a.mp4",
    "same-as-../../etc/passwd-1",
    "same-as-a/b-1",
    "same-as-x",
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
  it("сообщает об отказе в onBlocked", () => {
    const seen: string[] = [];
    expect(() => blockingOnDownload(policy, (m) => seen.push(m))("http://127.0.0.1:8790/x")).toThrow();
    expect(seen).toEqual([expect.stringMatching(/ассет заблокирован \(адрес вне сервера бандла\): http:\/\/127\.0\.0\.1:8790\/x/)]);
  });
});

describe("версия Remotion", () => {
  it("только закреплённая", () => {
    expect(() => assertPinnedRenderer(PINNED_RENDERER)).not.toThrow();
    expect(() => assertPinnedRenderer("4.0.538")).toThrow(/4\.0\.538 вместо 4\.0\.537/);
    expect(() => assertPinnedRenderer(undefined)).toThrow();
  });
  it("установленная совпадает с закреплённой", () => {
    const require = createRequire(import.meta.url);
    expect((require("@remotion/renderer/package.json") as { version: string }).version).toBe(PINNED_RENDERER);
  });
  it("media origin пока отвергается", () => {
    expect(() => installAssetGuard({ bundlePort: 1, media: { origin: "http://127.0.0.1:2", tokens: new Set() } })).toThrow(/Phase 4\/5/);
  });
});

// --- настоящие вызывающие downloadAsset ---

const require = createRequire(import.meta.url);
const DIST = dirname(require.resolve("@remotion/renderer"));
type Listener = (req: unknown, res: unknown) => void;
const ovs = require(join(DIST, "offthread-video-server.js")) as {
  startOffthreadVideoServer: (o: object) => { listener: Listener; close: () => Promise<void> };
};
const dl = require(join(DIST, "assets", "download-and-map-assets-to-file.js")) as {
  downloadAndMapAssetsToFileUrl: (o: object) => Promise<{ src: string }>;
};
const { RenderInternals } = require("@remotion/renderer") as { RenderInternals: { makeDownloadMap: () => unknown } };

async function listen(handler: (req: unknown, res: { end: (s?: string) => void }) => void): Promise<{ server: Server; port: number }> {
  const server = createServer(handler as never);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return { server, port: (server.address() as AddressInfo).port };
}
const close = (s: Server) => new Promise((r) => s.close(r));

describe("installAssetGuard на настоящих вызывающих", () => {
  const cleanups: (() => unknown)[] = [];
  afterEach(async () => {
    for (const c of cleanups.splice(0).reverse()) await c();
  });

  /** downloadMap Remotion с временными файлами в tmp/ репозитория, не в системном TMPDIR. */
  async function downloadMap(): Promise<unknown> {
    const tmp = await makeTmp();
    cleanups.push(() => removeTmp(tmp));
    const prev = process.env.TMPDIR;
    process.env.TMPDIR = tmp;
    try {
      return RenderInternals.makeDownloadMap();
    } finally {
      if (prev === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = prev;
    }
  }

  /** «Control API»: считает запросы. */
  async function service(): Promise<{ port: number; hits: () => number }> {
    let hits = 0;
    const { server, port } = await listen((_req, res) => {
      hits++;
      res.end("ok");
    });
    cleanups.push(() => close(server));
    return { port, hits: () => hits };
  }

  const audioArgs = (src: string, map: unknown) => ({
    renderAsset: { type: "audio", src, id: "a", frame: 0, volume: 1, mediaFrame: 0, playbackRate: 1, toneFrequency: 1, audioStartFrame: 0, audioStreamIndex: 0 },
    onDownload: () => undefined,
    downloadMap: map,
    logLevel: "error",
    indent: false,
    binariesDirectory: null,
    cancelSignalForAudioAnalysis: undefined,
    shouldAnalyzeAudioImmediately: false,
  });

  it("downloadAndMapAssetsToFileUrl (звук renderMedia): без защиты качает, с защитой — ноль запросов", async () => {
    const svc = await service();
    const map = await downloadMap();
    const src = `http://127.0.0.1:${svc.port}/a.mp3`;
    // контроль: путь действительно ведёт в сеть
    await dl.downloadAndMapAssetsToFileUrl(audioArgs(src, map));
    expect(svc.hits()).toBe(1);

    cleanups.push(installAssetGuard({ bundlePort: 1 }));
    await expect(dl.downloadAndMapAssetsToFileUrl(audioArgs(`${src}?2`, map))).rejects.toThrow(/ассет заблокирован/);
    expect(svc.hits()).toBe(1);
  });

  it("listener /proxy сервера бандла: 500 с меткой защиты, ноль запросов к сервису", async () => {
    const svc = await service();
    const off = ovs.startOffthreadVideoServer({
      downloadMap: await downloadMap(),
      offthreadVideoThreads: 1,
      logLevel: "error",
      indent: false,
      offthreadVideoCacheSizeInBytes: null,
      binariesDirectory: null,
    });
    cleanups.push(() => off.close());
    const front = await listen(off.listener as never);
    cleanups.push(() => close(front.server));
    const seen: string[] = [];
    cleanups.push(installAssetGuard({ bundlePort: front.port }, (m) => seen.push(m)));

    const src = encodeURIComponent(`http://127.0.0.1:${svc.port}/x`);
    const { status, body } = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      get(`http://127.0.0.1:${front.port}/proxy?src=${src}&time=0&transparent=false&toneMapped=true`, (res) => {
        let body = "";
        res.on("data", (d: Buffer) => (body += d.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      }).on("error", reject);
    });
    expect(status).toBe(500);
    expect(body).toMatch(/ассет заблокирован/);
    expect(svc.hits()).toBe(0);
    expect(seen).toHaveLength(1);
  });
});
