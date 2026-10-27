// Task 27: правка транскрипта — новая ревизия без потери таймкодов; синхронное сохранение.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TranscriptRevisionDocSchema, type TranscriptOp, type TranscriptRevisionDoc, joinWords } from "@ms/contracts";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import { applyTranscriptOps, currentTranscript, saveTranscriptRevision } from "../../src/edit/transcript-ops.js";
import { claimNext, enqueue } from "../../src/jobs/queue.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { asset } from "../db/video-fixtures.js";
import { longWords, trDoc, w } from "./helpers.js";

const doc = trDoc([w("w_000001", "привет", 0, 400_000), w("w_000002", "мир", 500_000, 900_000), w("w_000003", "как", 1_000_000, 1_200_000)]);
const ids = (d: TranscriptRevisionDoc) => d.words.map((x) => x.id);

describe("applyTranscriptOps (план)", () => {
  it("replace_text: id и время сохраняются, текст новый", () => {
    expect(applyTranscriptOps(doc, [{ op: "replace_text", word_id: "w_000002", text: "Мир!" }]).words[1])
      .toMatchObject({ id: "w_000002", text: "Мир!", start_us: 500_000, end_us: 900_000, timing: "asr" });
  });

  it("replace_span со вставкой: id <предыдущий>.1, время — в промежутке соседей", () => {
    const ins = applyTranscriptOps(doc, [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000002", text: "Привет большой мир" }]);
    expect(ids(ins)).toEqual(["w_000001", "w_000001.1", "w_000002", "w_000003"]);
    expect(ins.words[1]).toMatchObject({ text: "большой", start_us: 400_000, end_us: 500_000, timing: "interpolated" });
    expect(ins.words[0]!.text).toBe("Привет");
    expect(ins).toMatchObject({ revision: 2, parent_revision: 1, author: "user", ops: [{ op: "replace_span" }] });
    expect(TranscriptRevisionDocSchema.safeParse(ins).success).toBe(true);
  });

  it("replace_span с удалением: удалённые id — только в removed_word_ids", () => {
    const del = applyTranscriptOps(doc, [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000002", text: "Привет" }]);
    expect(ids(del)).toEqual(["w_000001", "w_000003"]);
    expect(del.removed_word_ids).toEqual(["w_000002"]);
    expect(del.segments.flatMap((s) => s.word_ids)).toEqual(["w_000001", "w_000003"]);
  });
});

describe("applyTranscriptOps (края)", () => {
  it("вставка в начало транскрипта — w_000000.1 нулевой длины в начале первого слова", () => {
    const d = applyTranscriptOps(doc, [{ op: "replace_text", word_id: "w_000001", text: "Ну привет" }]);
    expect(d.words[0]).toMatchObject({ id: "w_000000.1", text: "Ну", start_us: 0, end_us: 0, timing: "interpolated" });
    expect(TranscriptRevisionDocSchema.safeParse(d).success).toBe(true);
  });

  it("вставка в конец — нулевой длины в конце последнего слова", () => {
    const d = applyTranscriptOps(doc, [{ op: "replace_text", word_id: "w_000003", text: "как дела" }]);
    expect(d.words.at(-1)).toMatchObject({ id: "w_000003.1", text: "дела", start_us: 1_200_000, end_us: 1_200_000, timing: "interpolated" });
  });

  it("слова, слипшиеся без паузы и перекрытые, — вставленное нулевой длины, start_us не убывает", () => {
    const d0 = trDoc([w("w_000001", "а", 0, 500_000), w("w_000002", "б", 400_000, 900_000)]);
    const d = applyTranscriptOps(d0, [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000002", text: "а х у б" }]);
    expect(d.words.map((x) => [x.id, x.start_us, x.end_us])).toEqual([
      ["w_000001", 0, 500_000], ["w_000001.1", 400_000, 400_000], ["w_000001.2", 400_000, 400_000], ["w_000002", 400_000, 900_000]]);
    expect(TranscriptRevisionDocSchema.safeParse(d).success).toBe(true);
    // замена перекрытого слова: вставки не позже начала следующего
    const d1 = trDoc([w("w_000001", "а", 0, 500_000), w("w_000002", "б", 400_000, 900_000), w("w_000003", "в", 800_000, 1_000_000)]);
    const r = applyTranscriptOps(d1, [{ op: "replace_text", word_id: "w_000002", text: "х у" }]);
    expect(r.words.map((x) => [x.id, x.start_us, x.end_us])).toEqual([
      ["w_000001", 0, 500_000], ["w_000002", 400_000, 600_000], ["w_000002.1", 600_000, 800_000], ["w_000003", 800_000, 1_000_000]]);
    expect(TranscriptRevisionDocSchema.safeParse(r).success).toBe(true);
  });

  it("несколько вставок делят промежуток поровну", () => {
    const d = applyTranscriptOps(doc, [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000002", text: "привет большой добрый мир" }]);
    expect(d.words.slice(1, 3).map((x) => [x.id, x.start_us, x.end_us])).toEqual([["w_000001.1", 400_000, 450_000], ["w_000001.2", 450_000, 500_000]]);
  });

  it("замена N → M: первые min(N, M) id сохраняются, время всех — из диапазона заменённых слов", () => {
    // разбиение 1 → 2: id w_000002 сохраняется, вставка — после него
    const d = applyTranscriptOps(doc, [{ op: "replace_text", word_id: "w_000002", text: "Claude Code" }]);
    expect(d.words.map((x) => [x.id, x.text, x.start_us, x.end_us, x.timing])).toEqual([
      ["w_000001", "привет", 0, 400_000, "asr"], ["w_000002", "Claude", 500_000, 700_000, "interpolated"],
      ["w_000002.1", "Code", 700_000, 900_000, "interpolated"], ["w_000003", "как", 1_000_000, 1_200_000, "asr"]]);
    expect(d.removed_word_ids).toEqual([]);
    // слияние 2 → 1: первое id на всё время обоих (границы ASR — timing остаётся asr), второе удалено
    const d2 = applyTranscriptOps(doc, [{ op: "replace_span", start_word_id: "w_000002", end_word_id: "w_000003", text: "мирок" }]);
    expect(d2.words.at(-1)).toMatchObject({ id: "w_000002", text: "мирок", start_us: 500_000, end_us: 1_200_000, timing: "asr" });
    expect(d2.removed_word_ids).toEqual(["w_000003"]);
    // 3 → 2: два первых id, время — поровну на диапазоне трёх
    const d3 = applyTranscriptOps(doc, [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000003", text: "семь сот" }]);
    expect(d3.words.map((x) => [x.id, x.text, x.start_us, x.end_us])).toEqual([["w_000001", "семь", 0, 600_000], ["w_000002", "сот", 600_000, 1_200_000]]);
    expect(d3.removed_word_ids).toEqual(["w_000003"]);
    expect(TranscriptRevisionDocSchema.safeParse(d3).success).toBe(true);
  });

  it("ревью Task 33 M5: «MAC» + «-адреса» — склейка через пробел холостая, склейка joinWords сливает слова", () => {
    const mac = trDoc([w("w_000001", "два", 0, 300_000), w("w_000002", "MAC", 300_000, 600_000), w("w_000003", "-адреса", 600_000, 900_000)]);
    const span = { op: "replace_span" as const, start_word_id: "w_000001", end_word_id: "w_000003" };
    // поле «Изменить» заполняется склейкой через пробел: сохранение без правок — no_change
    expect(() => applyTranscriptOps(mac, [{ ...span, text: mac.words.map((x) => x.text).join(" ") }])).toThrow(/no_change/);
    // склейка joinWords («MAC-адреса») разбирается по пробелам в одно слово: id «-адреса» ушёл бы в удалённые
    const glued = applyTranscriptOps(mac, [{ ...span, text: joinWords(mac.words.map((x) => x.text)) }]);
    expect(ids(glued)).toEqual(["w_000001", "w_000002"]);
    expect(glued.removed_word_ids).toEqual(["w_000003"]);
  });

  describe("S17c B2: отдельные токены пунктуации ASR («–», «,») при правке сегмента", () => {
    // как в приёмке Phase 2 (w_000096 «–»): знак — отдельное слово ASR со своим временем
    const asr = trDoc([
      w("w_000001", "это", 0, 300_000), w("w_000002", "–", 300_000, 400_000), w("w_000003", "сеть", 400_000, 800_000),
      w("w_000004", ",", 800_000, 850_000), w("w_000005", "да", 900_000, 1_200_000),
    ]);
    const seg = { op: "replace_span" as const, start_word_id: "w_000001", end_word_id: "w_000005" };
    const view = (d: TranscriptRevisionDoc) => d.words.map((x) => [x.id, x.text, x.start_us, x.end_us]);

    it("сохранение сегмента без изменения текста (склейка через пробел, как в UI) — no_change, токены не меняются", () => {
      expect(() => applyTranscriptOps(asr, [{ ...seg, text: asr.words.map((x) => x.text).join(" ") }])).toThrow(/no_change/);
      expect(() => applyTranscriptOps(asr, [{ op: "replace_text", word_id: "w_000002", text: "–" }])).toThrow(/no_change/);
    });

    it("изменённый текст: знаки сохраняют свои id и тайминги, правка — только в словах", () => {
      const d = applyTranscriptOps(asr, [{ ...seg, text: "это – сеть , нет" }]);
      expect(view(d)).toEqual([
        ["w_000001", "это", 0, 300_000], ["w_000002", "–", 300_000, 400_000], ["w_000003", "сеть", 400_000, 800_000],
        ["w_000004", ",", 800_000, 850_000], ["w_000005", "нет", 900_000, 1_200_000],
      ]);
      expect(d.removed_word_ids).toEqual([]);
      // вставка рядом со знаком: знак остаётся отдельным словом со своим id
      const ins = applyTranscriptOps(asr, [{ ...seg, text: "это – новая сеть , да" }]);
      expect(ins.words.map((x) => [x.id, x.text])).toEqual([
        ["w_000001", "это"], ["w_000002", "–"], ["w_000002.1", "новая"], ["w_000003", "сеть"], ["w_000004", ","], ["w_000005", "да"]]);
      expect(ins.words[1]).toMatchObject({ start_us: 300_000, end_us: 400_000, timing: "asr" });
    });

    it("знак убран из текста — его слово удалено; новый знак без пары в ASR — к соседнему слову, как раньше", () => {
      const d = applyTranscriptOps(asr, [{ ...seg, text: "это сеть , да" }]);
      expect(ids(d)).toEqual(["w_000001", "w_000003", "w_000004", "w_000005"]);
      expect(d.removed_word_ids).toEqual(["w_000002"]);
      const added = applyTranscriptOps(asr, [{ ...seg, text: "это – сеть , да !" }]);
      expect(added.words.map((x) => [x.id, x.text])).toEqual([
        ["w_000001", "это"], ["w_000002", "–"], ["w_000003", "сеть"], ["w_000004", ","], ["w_000005", "да!"]]);
    });
  });

  it("холостая правка (слова и тексты те же) — no_change", () => {
    expect(() => applyTranscriptOps(doc, [{ op: "replace_text", word_id: "w_000002", text: "мир" }])).toThrow(/no_change/);
    expect(() => applyTranscriptOps(doc, [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000003", text: "привет  мир как" }])).toThrow(/no_change/);
    // правка и её отмена в одной ревизии — тоже холостая
    expect(() => applyTranscriptOps(doc, [{ op: "replace_text", word_id: "w_000002", text: "Мир" }, { op: "replace_text", word_id: "w_000002", text: "мир" }]))
      .toThrow(/no_change/);
  });

  it("удалённые id не переиспользуются, removed_word_ids накапливается по ревизиям", () => {
    const d2 = applyTranscriptOps(doc, [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000002", text: "привет новый мир" }]);
    const d3 = applyTranscriptOps(d2, [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000002", text: "привет мир" }]);
    expect(d3.removed_word_ids).toEqual(["w_000001.1"]);
    const d4 = applyTranscriptOps(d3, [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000002", text: "привет старый мир" }]);
    expect(ids(d4)).toEqual(["w_000001", "w_000001.2", "w_000002", "w_000003"]);
    expect(d4).toMatchObject({ revision: 4, parent_revision: 3 });
  });

  it("пустой текст удаляет слова участка; пустой список операций — ошибка", () => {
    const d = applyTranscriptOps(doc, [{ op: "replace_span", start_word_id: "w_000002", end_word_id: "w_000003", text: "  " }]);
    expect(ids(d)).toEqual(["w_000001"]);
    expect(d.removed_word_ids).toEqual(["w_000002", "w_000003"]);
    expect(() => applyTranscriptOps(doc, [])).toThrow(/empty_ops/);
  });

  it("только пунктуация — к соседнему слову вне участка, слова участка удалены", () => {
    const d = applyTranscriptOps(doc, [{ op: "replace_text", word_id: "w_000002", text: "!" }]);
    expect(d.words.map((x) => [x.id, x.text])).toEqual([["w_000001", "привет!"], ["w_000003", "как"]]);
    const d1 = applyTranscriptOps(doc, [{ op: "replace_text", word_id: "w_000001", text: "«" }]);
    expect(d1.words.map((x) => [x.id, x.text])).toEqual([["w_000002", "«мир"], ["w_000003", "как"]]);
    const d2 = applyTranscriptOps(doc, [{ op: "replace_text", word_id: "w_000002", text: "—" }]);
    expect(d2.words.map((x) => [x.id, x.text])).toEqual([["w_000001", "привет —"], ["w_000003", "как"]]);
  });

  it("юникод: эмодзи, латиница, NFD — сохраняются как текст, совпадение по нормализации", () => {
    const d = applyTranscriptOps(doc, [{ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000003", text: "Привет 🙂 мир — как?".normalize("NFD") }]);
    expect(d.words.map((x) => [x.id, x.text])).toEqual([["w_000001", "Привет"], ["w_000001.1", "🙂"], ["w_000002", "мир —"], ["w_000003", "как?"]]);
  });

  it("неизвестное слово, обратный порядок — ошибки, документ не изменён", () => {
    expect(() => applyTranscriptOps(doc, [{ op: "replace_text", word_id: "w_000009", text: "x" }])).toThrow(/unknown_word/);
    expect(() => applyTranscriptOps(doc, [{ op: "replace_span", start_word_id: "w_000003", end_word_id: "w_000001", text: "x" }])).toThrow(/order/);
    // операция на слово, удалённое предыдущей операцией той же правки
    expect(() => applyTranscriptOps(doc, [
      { op: "replace_text", word_id: "w_000002", text: "" }, { op: "replace_text", word_id: "w_000002", text: "мир" }])).toThrow(/unknown_word/);
    expect(ids(doc)).toEqual(["w_000001", "w_000002", "w_000003"]);
  });

  // Порог ловит квадратичный разбор (на 20 000 слов — секунды), а не скорость машины: при 200 мс
  // тест падал под нагрузкой параллельных рендеров (838 мс при том же коде).
  it("производительность: правка одного участка в транскрипте ~20 000 слов < 1500 мс", () => {
    const big = trDoc(longWords(20_000));
    const op: TranscriptOp = { op: "replace_span", start_word_id: "w_010000", end_word_id: "w_010004", text: "слово49 новое слово0 слово1 слово2. ещё" };
    applyTranscriptOps(big, [op]); // прогрев JIT
    let best = Infinity;
    let out: TranscriptRevisionDoc | undefined;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      out = applyTranscriptOps(big, [op]);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(1500);
    // «слово3» → «ещё» — замена один к одному (id и время ASR), «новое» — вставка
    expect(out!.words).toHaveLength(20_001);
    expect(out!.words.slice(9_999, 10_005).map((x) => [x.id, x.text])).toEqual([
      ["w_010000", "слово49"], ["w_010000.1", "новое"], ["w_010001", "слово0"], ["w_010002", "слово1"], ["w_010003", "слово2."], ["w_010004", "ещё"]]);
  });
});

describe("saveTranscriptRevision", () => {
  let s: TestStore;
  let db: Db;
  let store: ArtifactStore;
  const r1Rel = () => artifactPaths(s.root, "p1").transcriptRev("trn_1", 1);
  const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
  const deps = () => ({ db, store, root: s.root });
  const ops: TranscriptOp[] = [{ op: "replace_text", word_id: "w_000002", text: "Мир!" }];

  beforeEach(async () => {
    s = await makeStore("ms-edit-trn-");
    db = openDb(s.root);
    await migrate(db);
    projects.create(db, { id: "p1", kind: "video", title: "Видео" });
    media.insert(db, asset());
    store = new ArtifactStore({ root: s.root, db, guard: s.guard });
    await store.writeRevision(r1Rel(), "transcript.json", doc, (d, files) => {
      transcripts.create(d, { id: "trn_1", project_id: "p1", media_id: "med_1", language: "ru" });
      transcripts.insertRevision(d, { doc, rel_path: `${r1Rel()}/transcript.json`, sha256: files[0]!.sha256 });
    });
  });
  afterEach(async () => {
    db.close();
    await removeStore(s);
  });

  it("новая ревизия r2: файл, строки слов и сегментов, current_revision; r1 не тронута", async () => {
    const r1File = join(s.root, r1Rel(), "transcript.json");
    const before = sha(r1File);
    await expect(saveTranscriptRevision(deps(), "trn_1", { base_revision: 1, ops })).resolves.toMatchObject({ revision: 2, parent_revision: 1, author: "user" });
    expect(sha(r1File)).toBe(before);
    expect(transcripts.get(db, "trn_1")!.current_revision).toBe(2);
    expect(transcripts.words(db, "trn_1", 2).map((x) => x.text)).toEqual(["привет", "Мир!", "как"]);
    expect(transcripts.words(db, "trn_1", 1).map((x) => x.text)).toEqual(["привет", "мир", "как"]);
    const rev = transcripts.revision(db, "trn_1", 2)!;
    expect(rev.sha256).toBe(sha(join(s.root, rev.rel_path)));
    expect(currentTranscript(db, s.root, "trn_1")).toMatchObject({ revision: 2, words: [{ text: "привет" }, { text: "Мир!" }, { text: "как" }] });
  });

  it("base_revision ≠ current → revision_conflict", async () => {
    await saveTranscriptRevision(deps(), "trn_1", { base_revision: 1, ops });
    await expect(saveTranscriptRevision(deps(), "trn_1", { base_revision: 1, ops })).rejects.toThrow(/revision_conflict/);
    await expect(saveTranscriptRevision(deps(), "trn_1", { base_revision: 1, ops })).rejects.toMatchObject({ code: "revision_conflict", current: 2 });
  });

  it("гонка двух правок одной базы: одна r2, другая revision_conflict", async () => {
    const res = await Promise.allSettled([
      saveTranscriptRevision(deps(), "trn_1", { base_revision: 1, ops }),
      saveTranscriptRevision(deps(), "trn_1", { base_revision: 1, ops: [{ op: "replace_text", word_id: "w_000003", text: "Как" }] }),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const err = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(err.reason).toMatchObject({ code: "revision_conflict" });
    expect(transcripts.get(db, "trn_1")!.current_revision).toBe(2);
    expect(transcripts.revision(db, "trn_1", 3)).toBeUndefined();
  });

  it("правка во время задачи, держащей замок транскрипта, → resource_busy, ревизии нет", async () => {
    enqueue(db, { type: "asr.transcribe", projectId: "p1", input: {}, idempotencyKey: "asr" });
    claimNext(db, "srv", 0, { running: 0, maxRunning: 2 });
    await expect(saveTranscriptRevision(deps(), "trn_1", { base_revision: 1, ops })).rejects.toMatchObject({ code: "resource_busy" });
    expect(transcripts.get(db, "trn_1")!.current_revision).toBe(1);
  });

  it("холостая правка — no_change (422), ревизии нет", async () => {
    await expect(saveTranscriptRevision(deps(), "trn_1", { base_revision: 1, ops: [{ op: "replace_text", word_id: "w_000002", text: "мир" }] }))
      .rejects.toMatchObject({ code: "no_change", status: 422 });
    expect(transcripts.get(db, "trn_1")!.current_revision).toBe(1);
    expect(transcripts.revision(db, "trn_1", 2)).toBeUndefined();
  });

  it("невалидная правка — ошибка до записи; неизвестный транскрипт — not_found", async () => {
    await expect(saveTranscriptRevision(deps(), "trn_1", { base_revision: 1, ops: [{ op: "replace_text", word_id: "w_000042", text: "x" }] })).rejects.toThrow(/unknown_word/);
    await expect(saveTranscriptRevision(deps(), "trn_9", { base_revision: 1, ops })).rejects.toThrow(/transcript_not_found/);
    expect(transcripts.revision(db, "trn_1", 2)).toBeUndefined();
  });
});
