// Сцена проверки сети: локальный ассет из бандла должен загрузиться, внешние адреса —
// нет (chrome-wrapper.sh направляет не-loopback трафик в 127.0.0.1:9).
import { useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender } from "remotion";
import dot from "./dot.png";

const probe = (url: string) =>
  fetch(url, { mode: "no-cors", cache: "no-store" }).then(
    () => "open",
    () => "blocked",
  );

export const Scene = () => {
  useState(() => {
    const handle = delayRender("net-scene: проверка сети");
    void Promise.all([probe("https://example.com/"), probe("http://1.1.1.1/")]).then(([host, ip]) => {
      console.log(`net-scene: example.com ${host}, 1.1.1.1 ${ip}`);
      continueRender(handle);
    });
    return handle;
  });
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", justifyContent: "center", alignItems: "center" }}>
      <Img src={dot} style={{ width: 64, height: 64 }} />
    </AbsoluteFill>
  );
};
