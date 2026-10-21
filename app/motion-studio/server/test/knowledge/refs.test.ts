import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KnowledgeAdapter } from "../../src/knowledge/adapter.js";

describe("copyRefs / getSourceReference", () => {
  let base: string;
  let kb: KnowledgeAdapter;
  let dest: string;
  const rec = (o: Record<string, unknown>) => ({
    name: "X", kind: "component", category: "misc", visualizes: "v", use_when: "", voiceover_cues: [], inputs: "",
    adaptations: "", patterns: [], compat_flags: [], docs: [], verification: "static-review",
    remotion_compat: "native", license: "MIT (x)", repo: "r", ...o,
  });
  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "kb-refs-"));
    const kbRoot = join(base, "kb");
    const src = join(base, "src");
    await mkdir(join(kbRoot, "components", "r"), { recursive: true });
    await mkdir(join(src, "templates", "r"), { recursive: true });
    await writeFile(join(src, "templates", "r", "a.tsx"), "export const A = 1;");
    await writeFile(join(base, "outside.txt"), "outside");
    await symlink(join(base, "outside.txt"), join(src, "templates", "r", "link.tsx"));
    await writeFile(join(kbRoot, "components", "r", "ok.md"), "# ok `r/ok`");
    const rows = [
      rec({ id: "r/ok", card: "components/r/ok.md", source_files: ["templates/r/a.tsx", "templates/r/gone.tsx"] }),
      rec({ id: "r/lic", card: "components/r/ok.md", source_files: ["templates/r/a.tsx"], license: "MIT + Commons Clause" }),
      rec({ id: "r/unk", card: "components/r/ok.md", source_files: ["templates/r/a.tsx"], license: "не указана" }),
      rec({ id: "r/esc", card: "components/r/ok.md", source_files: ["../outside.txt"] }),
      rec({ id: "r/abs", card: "components/r/ok.md", source_files: [join(base, "outside.txt")] }),
      rec({ id: "r/sym", card: "components/r/ok.md", source_files: ["templates/r/link.tsx"] }),
    ];
    await writeFile(join(kbRoot, "capabilities.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    await writeFile(join(kbRoot, "repositories.json"), JSON.stringify({ repositories: [{ id: "r", url: "u", commit: "abc1234", license: "MIT" }] }));
    kb = await KnowledgeAdapter.load({ kbRoot, sourceRoot: src });
    dest = join(base, "dest");
    await mkdir(dest);
  });
  afterAll(() => rm(base, { recursive: true, force: true }));

  it("getSourceReference: exists true/false, не бросает", async () => {
    const refs = await kb.getSourceReference("r/ok");
    expect(refs.map((r) => r.exists)).toEqual([true, false]);
    expect(refs[0]!.path).toBe("templates/r/a.tsx");
  });

  it("копирует файлы и CARD.md, missing перечислен", async () => {
    const [res] = await kb.copyRefs(["r/ok"], dest);
    expect(res).toEqual({ id: "r/ok", copied: ["templates/r/a.tsx", "CARD.md"], missing: ["templates/r/gone.tsx"] });
    expect(await readFile(join(dest, "r", "ok", "templates", "r", "a.tsx"), "utf8")).toBe("export const A = 1;");
    expect(await readFile(join(dest, "r", "ok", "CARD.md"), "utf8")).toContain("r/ok");
  });

  it("отказ для restricted и unknown, ничего не создаётся", async () => {
    await expect(kb.copyRefs(["r/lic"], dest)).rejects.toThrow(/restricted/);
    await expect(kb.copyRefs(["r/unk"], dest)).rejects.toThrow(/unknown/);
    expect((await readdir(dest)).sort()).toEqual(["r"]);
    expect(await readdir(join(dest, "r"))).toEqual(["ok"]);
  });

  it("отказ для неизвестного id", async () => {
    await expect(kb.copyRefs(["r/none"], dest)).rejects.toThrow(/r\/none/);
  });

  it("путь вне корня исходников и абсолютный — отказ", async () => {
    await expect(kb.copyRefs(["r/esc"], dest)).rejects.toThrow(/вне корня/);
    await expect(kb.copyRefs(["r/abs"], dest)).rejects.toThrow(/вне корня/);
  });

  it("симлинк — отказ", async () => {
    await expect(kb.copyRefs(["r/sym"], dest)).rejects.toThrow(/симлинк/);
  });

  it("проверки до записей: плохой id в списке не оставляет следов от хороших", async () => {
    const fresh = join(base, "dest2");
    await mkdir(fresh);
    await expect(kb.copyRefs(["r/ok", "r/sym"], fresh)).rejects.toThrow(/симлинк/);
    expect(await readdir(fresh)).toEqual([]);
  });

  it("getSourceReference: .., абсолютный путь и симлинк — exists:false, invalid и reason", async () => {
    for (const id of ["r/esc", "r/abs", "r/sym"]) {
      const [ref] = await kb.getSourceReference(id);
      expect(ref).toMatchObject({ exists: false, invalid: true, absPath: "" });
      expect(ref!.reason).toMatch(/вне корня|симлинк/);
    }
    const ok = (await kb.getSourceReference("r/ok"))[0]!;
    expect(ok.invalid).toBeUndefined();
  });
});
