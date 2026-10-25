// «Пустой» каталог проекта (Task 47, раунд исправлений 1): только каталоги, ни одного файла или
// ссылки. Такой остаётся, когда запись в удалённый проект успела создать родителей ревизии
// (`safeMkdir`) до отказа `project_deleted`; данных человека в нём нет, поэтому его можно убрать,
// а сверка корзины при старте не считает его восстановленным проектом.
import { lstatSync, readdirSync, rmdirSync } from "node:fs";
import { join } from "node:path";

/** Есть, настоящий каталог и внутри только каталоги (рекурсивно). */
export function isHollowDir(abs: string): boolean {
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    return false;
  }
  if (!st.isDirectory()) return false;
  return readdirSync(abs, { withFileTypes: true }).every((e) => e.isDirectory() && isHollowDir(join(abs, e.name)));
}

/** Удаляет пустой каталог снизу вверх (`rmdir` — непустой не удалится); иначе ничего. */
export function removeHollowDir(abs: string): boolean {
  if (!isHollowDir(abs)) return false;
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) walk(join(dir, e.name));
    rmdirSync(dir);
  };
  walk(abs);
  return true;
}
