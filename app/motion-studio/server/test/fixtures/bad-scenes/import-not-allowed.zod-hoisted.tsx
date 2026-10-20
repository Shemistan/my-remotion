// Плохая сцена: ровно одно нарушение (правило — префикс имени файла).
// zod поднят npm workspaces в общий node_modules, но в allowlist его нет.
import z from "zod";
export const Scene = () => <div>{String(z)}</div>;
