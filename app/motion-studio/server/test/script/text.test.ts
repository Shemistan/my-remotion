// S2 «сценарий → моушн»: ревизии текста сценария (`saveScriptText`) во временном хранилище.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tokenizeScript } from "@ms/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as projects from "../../src/db/repos/projects.js";
import { scriptRevisions, scripts } from "../../src/db/repos/script.js";
import { currentScript, SCRIPT_FILE } from "../../src/script/read.js";
import { saveScriptText } from "../../src/script/text.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

let s: TestStore;
let db: Db;
let deps: { db: Db; root: string; store: ArtifactStore };
const p = "p1";
const blocks = [{ title: "A", text: "Раз два. Три!" }];

beforeEach(async () => {
  s = await makeStore("ms-script-text-");
  db = openDb(s.root);
  await migrate(db, { log: () => undefined });
  deps = { db, root: s.root, store: new ArtifactStore({ root: s.root, db, guard: s.guard }) };
  projects.create(db, { id: p, kind: "script", title: "Сценарий" });
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

describe("текст человека", () => {
  // tmp/script-mvp/block-1.txt без первой строки (она — заголовок) → 205 слов (~82 с речи)
  const file = new URL("../../../../../tmp/script-mvp/block-1.txt", import.meta.url);
  it.skipIf(!existsSync(file))("block-1: 205 слов по правилу S1", async () => {
    const text = readFileSync(file, "utf8").split("\n").slice(1).join("\n").trim();
    expect(tokenizeScript([{ title: "Блок 1", text }]).words).toHaveLength(205);
    const doc = await saveScriptText(deps, p, { blocks: [{ title: "Блок 1", text }] });
    expect(doc.words).toHaveLength(205);
  });
});

describe("saveScriptText", () => {
  it("первая ревизия: документ, индекс в БД, файл только для чтения", async () => {
    const r1 = await saveScriptText(deps, p, { blocks: [{ title: "A", text: "Раз два." }] });
    expect(r1).toMatchObject({ schema_version: 1, revision: 1, author: "user", blocks: [{ id: "b1", title: "A", text: "Раз два." }] });
    expect(r1.parent_revision).toBeUndefined();
    expect(r1.words.map((w) => w.text)).toEqual(["Раз", "два"]);
    const row = scripts.byProject(db, p)!;
    expect(row).toMatchObject({ id: r1.script_id, current_revision: 1 });
    expect(r1.script_id).toMatch(/^scr_/);
    const rev = scriptRevisions.get(db, row.id, 1)!;
    expect(rev.rel_path).toBe(`${artifactPaths(s.root, p).scriptRev(row.id, 1)}/${SCRIPT_FILE}`);
    expect(rev.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rev.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(currentScript(db, s.root, p)).toEqual(r1);
  });

  it("base_revision: не текущая — revision_conflict; текущая — следующая ревизия, файлы a-w", async () => {
    const r1 = await saveScriptText(deps, p, { blocks: [{ title: "A", text: "Раз два." }] });
    await expect(saveScriptText(deps, p, { base_revision: 0, blocks })).rejects.toMatchObject({ code: "revision_conflict" });
    await expect(saveScriptText(deps, p, { base_revision: 2, blocks })).rejects.toMatchObject({ code: "revision_conflict" });
    const r2 = await saveScriptText(deps, p, { base_revision: 1, blocks });
    expect(r2).toMatchObject({ revision: 2, parent_revision: 1, script_id: r1.script_id });
    await expect(saveScriptText(deps, p, { base_revision: 1, blocks })).rejects.toMatchObject({ code: "revision_conflict" });
    const file = join(s.root, artifactPaths(s.root, p).scriptRev(r1.script_id, 2), SCRIPT_FILE);
    expect(statSync(file).mode & 0o222).toBe(0);
    expect(statSync(join(s.root, artifactPaths(s.root, p).scriptRev(r1.script_id, 1), SCRIPT_FILE)).mode & 0o222).toBe(0);
    expect(scripts.byProject(db, p)!.current_revision).toBe(2);
  });

  it("base_revision до первой ревизии — конфликт; без base_revision — следующая ревизия", async () => {
    await expect(saveScriptText(deps, p, { base_revision: 1, blocks })).rejects.toMatchObject({ code: "revision_conflict" });
    await saveScriptText(deps, p, { blocks });
    expect((await saveScriptText(deps, p, { blocks })).revision).toBe(2);
  });

  it("> 6000 слов — script_too_long (413); ровно 6000 — можно", async () => {
    const e = await saveScriptText(deps, p, { blocks: [{ title: "", text: "слово ".repeat(6001) }] }).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: "script_too_long", status: 413 });
    expect(scripts.byProject(db, p)).toBeUndefined();
    expect((await saveScriptText(deps, p, { blocks: [{ title: "", text: "слово ".repeat(3000) }, { title: "", text: "слово ".repeat(3000) }] })).words).toHaveLength(6000);
  });

  it("пустой блок (пробелы или без слов) — empty_block (400) с номером блока", async () => {
    const e = await saveScriptText(deps, p, { blocks: [{ title: "", text: "Раз." }, { title: "", text: "  " }] }).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: "empty_block", status: 400, extra: { block: 2 } });
    await expect(saveScriptText(deps, p, { blocks: [{ title: "", text: " — «…» " }] })).rejects.toMatchObject({ code: "empty_block" });
    expect(scripts.byProject(db, p)).toBeUndefined();
  });

  it("проект: нет — 404; не сценарный — 409 not_script_project", async () => {
    await expect(saveScriptText(deps, "nope", { blocks })).rejects.toMatchObject({ status: 404 });
    projects.create(db, { id: "v1", kind: "video", title: "Видео" });
    await expect(saveScriptText(deps, "v1", { blocks })).rejects.toMatchObject({ code: "not_script_project", status: 409 });
  });

  it("гонка двух правок одной базы: вторая — revision_conflict, не artifact_exists", async () => {
    await saveScriptText(deps, p, { blocks });
    const both = await Promise.allSettled([
      saveScriptText(deps, p, { base_revision: 1, blocks }),
      saveScriptText(deps, p, { base_revision: 1, blocks }),
    ]);
    expect(both.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(both.find((x) => x.status === "rejected")).toMatchObject({ reason: { code: "revision_conflict" } });
  });
});
