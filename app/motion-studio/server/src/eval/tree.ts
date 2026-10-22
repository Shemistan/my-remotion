// Состояние дерева в прогоне eval (S2-fix2, m5): рендер хэширует motion-kit живьём, поэтому
// незакоммиченная правка в окне генерации попадает в превью, а gen.json выдавал коммит за чистый.

/** Дерево приложения: есть ли незакоммиченные правки и хэш motion-kit (`sha256:<16>`, как в manifest). */
export interface TreeState {
  dirty: boolean;
  kit_hash: string;
}

/** Отказ на старте генерации: грязное дерево без `--allow-dirty` (сообщение) или null. */
export function dirtyStartError(t: TreeState, allowDirty: boolean): string | null {
  if (!t.dirty || allowDirty) return null;
  return "дерево app/motion-studio с незакоммиченными правками: превью нельзя будет привязать к коммиту. Закоммить или отложи правки; осознанно — флаг --allow-dirty (сцены пометятся -dirty).";
}

/**
 * Чем сгенерирована сцена (чистая функция): дерево грязное до или после сцены, или kit
 * поменялся за время сцены (правка и откат) — `-dirty`; при смене kit — оба хэша.
 */
export function sceneTree(sha: string, start: TreeState, end: TreeState): { commit: string; dirty: boolean; kit_hash: string; kit_hash_start?: string } {
  const kitMoved = start.kit_hash !== end.kit_hash;
  const dirty = start.dirty || end.dirty || kitMoved;
  return { commit: dirty ? `${sha}-dirty` : sha, dirty, kit_hash: end.kit_hash, ...(kitMoved ? { kit_hash_start: start.kit_hash } : {}) };
}
