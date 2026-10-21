// Дефект «пустой кадр»: сцена рисует только фон — элементы спецификации не построены.
import { presets } from "@ms/motion-kit";
import { AbsoluteFill } from "remotion";

export const Scene = () => <AbsoluteFill style={{ background: presets["dark-premium"].palette.bg }} />;
