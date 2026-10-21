// Плохая сцена: ровно одно нарушение (правило — префикс имени файла).
import { OffthreadVideo } from "remotion";
export const Scene = ({ clip }: { clip: string }) => <OffthreadVideo src={clip} />;
