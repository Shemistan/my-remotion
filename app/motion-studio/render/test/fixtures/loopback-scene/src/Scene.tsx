// Сцена проверки loopback: локальный сервис на 127.0.0.1:<props.port> (как Control API
// на 8790) недоступен из Chrome рендера, а ассеты бандла (сервер Remotion на своём
// порту) загружаются.
import { useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender } from "remotion";
import dot from "./dot.png";

const probe = (url: string) =>
  fetch(url, { mode: "no-cors", cache: "no-store" }).then(
    () => "open",
    () => "blocked",
  );

export const Scene = ({ port }: { port: number }) => {
  useState(() => {
    const handle = delayRender("loopback-scene: проверка loopback");
    void Promise.all([probe(`http://127.0.0.1:${port}/a`), probe(`http://localhost:${port}/b`), probe(`http://[::1]:${port}/c`)]).then(
      ([ip, host, v6]) => {
        console.log(`loopback-scene: 127.0.0.1 ${ip}, localhost ${host}, ::1 ${v6}`);
        continueRender(handle);
      },
    );
    return handle;
  });
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", justifyContent: "center", alignItems: "center" }}>
      <Img src={dot} style={{ width: 64, height: 64 }} />
    </AbsoluteFill>
  );
};
