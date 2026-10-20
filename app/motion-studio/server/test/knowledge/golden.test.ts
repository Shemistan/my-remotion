import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import { repoKnowledge, sourceRoot } from "./helpers.js";

describe("golden: реальная KB", () => {
  let kb: KnowledgeAdapter;
  beforeAll(async () => {
    kb = await KnowledgeAdapter.load({ kbRoot: repoKnowledge, sourceRoot });
  });
  const ids = (q: string, n: number) => kb.search(q).slice(0, n).map((h) => h.view.id);

  const t1 = "Создай премиальную анимацию роста пользователей с 10 000 до 1 000 000 за три года";
  it("рост пользователей: счётчик в топ-5", () => {
    expect(ids(t1, 5)).toContain("remotion-bits/animated-counter");
  });
  // ЗНАЧИТЕЛЬНАЯ НАХОДКА по формулировке записи KB (см. отчёт Task 8): у line-chart-anim нет ни одного
  // токена запроса (только «аудитория стабильно росла…», запрос — «роста»; «пользователей», «анимацию»,
  // «года» в записи нет), по весам брифа запись не набирает ни одного очка. Ожидание брифа сохранено
  // дословно; it.fails упадёт (и потребует снять метку), когда запись KB получит нужные слова.
  it.fails("рост пользователей: линейный график в топ-10 (брифовое ожидание)", () => {
    expect(ids(t1, 10)).toContain("free-remotion-templates/line-chart-anim");
  });
  it("архитектура агента: animated-beam в топ-10", () => {
    expect(
      ids("Покажи архитектуру AI-агента: оркестратор вызывает три инструмента. Световые импульсы движутся по связям", 10),
    ).toContain("magicui/animated-beam");
  });
  it("kinetic typography (EN -> RU через синонимы)", () => {
    expect(ids("kinetic typography", 5).some((id) => id.includes("kinetic"))).toBe(true);
  });
  it("по умолчанию только permissive", () => {
    expect(kb.search("счётчик").every((h) => h.view.license_class === "permissive")).toBe(true);
  });
  it("commit из repositories.json", () => {
    expect(kb.getCapability("remotion-bits/animated-counter")!.commit).toMatch(/^[0-9a-f]{7,}$/);
  });
  it("836 записей", () => {
    expect(kb.size).toBe(836);
  });
  it("исходник в несуществующем корне: exists=false", async () => {
    const fake = await KnowledgeAdapter.load({ kbRoot: repoKnowledge, sourceRoot: "/nonexistent-kb-root" });
    expect((await fake.getSourceReference("remotion-bits/animated-counter"))[0]!.exists).toBe(false);
  });
  it("карточка и паттерн читаются; автотаблица кандидатов вырезана", async () => {
    expect(await kb.getComponentCard("remotion-bits/animated-counter")).toContain("remotion-bits/animated-counter");
    const p = await kb.getVisualPatterns("growth-decline");
    expect(p).toContain("Визуальные приёмы");
    expect(p).not.toContain("kb:begin");
    expect(p).not.toContain("Кандидаты из каталога");
    await expect(kb.getVisualPatterns("../x")).rejects.toThrow();
  });
  it("getCompatibility", () => {
    const c = kb.getCompatibility("remotion-bits/animated-counter");
    expect(c.compatibility_status).toBe("native");
    expect(c.tested_status).toBe("static-review");
  });
  it("реальные исходники копируются в draft", async () => {
    const d = await mkdtemp(join(tmpdir(), "kb-golden-"));
    try {
      const [r] = await kb.copyRefs(["remotion-bits/animated-counter"], d);
      if (!r) throw new Error("нет результата");
      expect(r.missing).toEqual([]);
      expect(r.copied).toContain("CARD.md");
      expect(await readdir(join(d, "remotion-bits"))).toEqual(["animated-counter"]);
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });
});
