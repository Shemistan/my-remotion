// Сцена проверки Node-стороны рендера: сервер бандла Remotion отвечает на
// `/proxy?src=…` и сам (из Node, вне прокси Chrome) скачивает `src`; `<Audio>` с URL
// Node скачивает при сборке звука. Локальный сервис на 127.0.0.1:<props.port> (как
// Control API) не должен получить ни одного запроса, а картинка из бандла — грузиться.
//   mode "fetch" — fetch('/proxy?src=…') из сцены, ответ пишется в лог;
//   mode "img"   — <Img src="/proxy?src=…">, рендер должен упасть;
//   mode "audio" — <Audio src="http://127.0.0.1:<port>/a.mp3">, превью должно упасть.
import { useState } from "react";
import { AbsoluteFill, Audio, Img, continueRender, delayRender } from "remotion";
import dot from "./dot.png";

type Props = { port: number; mode: "fetch" | "img" | "audio" };

const proxied = (port: number) =>
  `/proxy?src=${encodeURIComponent(`http://127.0.0.1:${port}/x.png`)}&time=0&transparent=false&toneMapped=true`;

const FetchProbe = ({ port }: { port: number }) => {
  useState(() => {
    const handle = delayRender("proxy-scene: проверка /proxy");
    void fetch(proxied(port), { cache: "no-store" })
      .then(async (r) => `status ${r.status} ${(await r.text()).includes("ассет заблокирован") ? "guarded" : "unguarded"}`)
      .catch(() => "network error")
      .then((s) => {
        console.log(`proxy-scene: ${s}`);
        continueRender(handle);
      });
    return handle;
  });
  return null;
};

export const Scene = ({ port, mode }: Props) => (
  <AbsoluteFill style={{ backgroundColor: "#000000", justifyContent: "center", alignItems: "center" }}>
    <Img src={dot} style={{ width: 64, height: 64 }} />
    {mode === "fetch" ? <FetchProbe port={port} /> : null}
    {mode === "img" ? <Img src={proxied(port)} maxRetries={0} style={{ width: 64, height: 64 }} /> : null}
    {mode === "audio" ? <Audio src={`http://127.0.0.1:${port}/a.mp3`} /> : null}
  </AbsoluteFill>
);
