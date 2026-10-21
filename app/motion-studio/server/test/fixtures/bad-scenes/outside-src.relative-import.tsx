// Плохая сцена: ровно одно нарушение (правило — префикс имени файла).
import x from "../../outside";
export const Scene = () => <div>{String(x)}</div>;
