// Сцена проверки разрешения модулей: тест кладёт рядом поддельный
// `<версия>/node_modules/@remotion/fonts`; бандл обязан взять настоящий пакет.
import { loadFont } from "@remotion/fonts";
import { useState } from "react";
import { AbsoluteFill } from "remotion";

export const Scene = () => {
  useState(() => console.log(`shadow-scene: loadFont ${typeof loadFont}`));
  return <AbsoluteFill style={{ backgroundColor: "#000000" }} />;
};
