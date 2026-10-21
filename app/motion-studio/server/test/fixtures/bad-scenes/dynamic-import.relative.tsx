// Плохая сцена: ровно одно нарушение (правило — префикс имени файла).
const m = await import("./x");
export const Scene = () => <div>{String(m)}</div>;
