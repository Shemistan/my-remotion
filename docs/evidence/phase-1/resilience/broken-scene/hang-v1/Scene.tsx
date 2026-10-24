// Сцена, вешающая рендер: delayRender без continueRender. Рендер должен упасть по
// таймауту renderVersion, а группа процессов — быть убита.
import { useState } from "react";
import { AbsoluteFill, delayRender } from "remotion";

export const Scene = () => {
  useState(() => {
    console.log("hang-scene: delayRender без continueRender");
    return delayRender("hang-scene никогда не продолжит рендер");
  });
  return <AbsoluteFill style={{ backgroundColor: "#200000" }} />;
};
