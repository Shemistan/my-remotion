// Рукописная версия «в обход static check» (Task 20, loopback.e2e): сцена пытается достучаться
// до настоящего Control API на 127.0.0.1:8790. Ни один запрос не должен дойти до сервера.
//   mode "fetch" — fetch() из Chrome на /api/health по 127.0.0.1, localhost и [::1];
//   mode "proxy" — fetch('/proxy?src=http://127.0.0.1:8790/api/health') у сервера бандла;
//   mode "img"   — <Img src="/proxy?src=…/api/health">: рендер должен упасть (ASSET_BLOCKED);
//   mode "audio" — <Audio src="http://127.0.0.1:8790/api/health">: превью должно упасть.
import { useState } from "react";
import { AbsoluteFill, Audio, Img, continueRender, delayRender } from "remotion";
import dot from "./dot.png";

type Props = { port: number; mode: "fetch" | "proxy" | "img" | "audio" };

const api = (host: string, port: number) => `http://${host}:${port}/api/health`;
const proxied = (port: number) => `/proxy?src=${encodeURIComponent(api("127.0.0.1", port))}&time=0&transparent=false&toneMapped=true`;

const probe = (url: string) =>
  fetch(url, { mode: "no-cors", cache: "no-store" }).then(
    () => "open",
    () => "blocked",
  );

const Direct = ({ port }: { port: number }) => {
  useState(() => {
    const handle = delayRender("api-loopback: прямой fetch");
    void Promise.all([probe(api("127.0.0.1", port)), probe(api("localhost", port)), probe(api("[::1]", port))]).then(([ip, host, v6]) => {
      console.log(`api-loopback: 127.0.0.1 ${ip}, localhost ${host}, ::1 ${v6}`);
      continueRender(handle);
    });
    return handle;
  });
  return null;
};

const ViaProxy = ({ port }: { port: number }) => {
  useState(() => {
    const handle = delayRender("api-loopback: /proxy");
    void fetch(proxied(port), { cache: "no-store" })
      .then(async (r) => `status ${r.status} ${(await r.text()).includes("ассет заблокирован") ? "guarded" : "unguarded"}`)
      .catch(() => "network error")
      .then((s) => {
        console.log(`api-loopback: proxy ${s}`);
        continueRender(handle);
      });
    return handle;
  });
  return null;
};

export const Scene = ({ port, mode }: Props) => (
  <AbsoluteFill style={{ backgroundColor: "#000000", justifyContent: "center", alignItems: "center" }}>
    <Img src={dot} style={{ width: 64, height: 64 }} />
    {mode === "fetch" ? <Direct port={port} /> : null}
    {mode === "proxy" ? <ViaProxy port={port} /> : null}
    {mode === "img" ? <Img src={proxied(port)} maxRetries={0} style={{ width: 64, height: 64 }} /> : null}
    {mode === "audio" ? <Audio src={api("127.0.0.1", port)} /> : null}
  </AbsoluteFill>
);
