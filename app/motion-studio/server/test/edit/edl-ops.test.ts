// Task 27: операции EDL (вырезки по словам, статусы, восстановление) и синхронные ревизии EDL.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EdlRevisionDocSchema, acceptedCuts, buildTimeline, snapUsToFrame, type EdlOp, type Fps, type TranscriptWord } from "@ms/contracts";
import { approvalState, approve } from "../../src/approvals/engine.js";
import { currentSubject } from "../../src/approvals/subjects.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as edls from "../../src/db/repos/edls.js";
import { applyEdlOps, currentEdl, reanchorDecisions, saveEdlRevision } from "../../src/edit/edl-ops.js";
import { saveTranscriptRevision } from "../../src/edit/transcript-ops.js";
import { timelineFor } from "../../src/edit/timeline-store.js";
import { claimNext, enqueue } from "../../src/jobs/queue.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { F30, dec, edlDoc, seedVideo, w } from "./helpers.js";

const words: TranscriptWord[] = [
  w("w_000001", "привет", 0, 400_000),
  w("w_000002", "мир", 500_000, 900_000),
  w("w_000003", "как", 1_000_000, 1_200_000),
  w("w_000004", "дела", 3_000_000, 3_400_000),
  w("w_000005", "пока", 9_500_000, 9_900_000),
];
const DUR = 10_000_000;
const e1 = edlDoc([dec("d1", { status: "proposed", source_start_us: 2_000_000, source_end_us: 3_500_000 })]);

describe("applyEdlOps (план)", () => {
  it("вырезка и её восстановление: таймлайн байт-в-байт как до вырезки", () => {
    const e2 = applyEdlOps(e1, [{ op: "set_status", decision_id: "d1", status: "accepted" }], words, F30);
    expect(buildTimeline(DUR, acceptedCuts(e2), F30).duration_us).toBe(8_500_000);
    expect(e2).toMatchObject({ revision: 2, parent_revision: 1, ops: [{ op: "set_status" }] });
    const e3 = applyEdlOps(e2, [{ op: "set_status", decision_id: "d1", status: "rejected" }], words, F30);
    expect(buildTimeline(DUR, acceptedCuts(e3), F30)).toEqual(buildTimeline(DUR, [], F30));
    expect(JSON.stringify(buildTimeline(DUR, acceptedCuts(e3), F30))).toBe(JSON.stringify(buildTimeline(DUR, acceptedCuts(e1), F30)));
  });

  it("add_cut по словам: origin user, accepted, manual, границы по словам", () => {
    const d = applyEdlOps(e1, [{ op: "add_cut", start_word_id: "w_000002", end_word_id: "w_000002" }], words, F30);
    expect(d.decisions.at(-1)).toMatchObject({
      origin: "user", status: "accepted", reason: "manual", start_word_id: "w_000002", end_word_id: "w_000002",
      source_start_us: 500_000, source_end_us: 900_000, confidence: 1,
    });
    expect(EdlRevisionDocSchema.safeParse(d).success).toBe(true);
  });
});

describe("applyEdlOps: add_cut", () => {
  it("пауза после последнего слова вырезки уходит в вырезку, keepBeforeWordUs до следующего слова", () => {
    const d = applyEdlOps(e1, [{ op: "add_cut", start_word_id: "w_000002", end_word_id: "w_000003" }], words, F30);
    expect(d.decisions.at(-1)).toMatchObject({ source_start_us: 500_000, source_end_us: 2_900_000 });
    const d2 = applyEdlOps(e1, [{ op: "add_cut", start_word_id: "w_000003", end_word_id: "w_000003" }], words, F30, { keepBeforeWordUs: 500_000 });
    expect(d2.decisions.at(-1)).toMatchObject({ source_start_us: 1_000_000, source_end_us: 2_500_000 });
  });

  it("последнее слово транскрипта — до его конца", () => {
    const d = applyEdlOps(e1, [{ op: "add_cut", start_word_id: "w_000005", end_word_id: "w_000005" }], words, F30, { sourceDurationUs: DUR });
    expect(d.decisions.at(-1)).toMatchObject({ source_start_us: 9_500_000, source_end_us: 9_900_000 });
  });

  it("слова вне таймлайна: начало за концом исходника — word_out_of_range; хвост — обрезан концом исходника", () => {
    const ws = [...words, w("w_000006", "эхо", 9_950_000, 10_400_000), w("w_000007", "шум", 10_500_000, 10_700_000)];
    expect(() => applyEdlOps(e1, [{ op: "add_cut", start_word_id: "w_000007", end_word_id: "w_000007" }], ws, F30, { sourceDurationUs: DUR }))
      .toThrow(/word_out_of_range/);
    const d = applyEdlOps(e1, [{ op: "add_cut", start_word_id: "w_000006", end_word_id: "w_000006" }], ws, F30, { sourceDurationUs: DUR });
    expect(d.decisions.at(-1)).toMatchObject({ source_start_us: 9_966_667, source_end_us: DUR });
  });

  it("вставленное слово нулевой длины без паузы рядом — empty_cut; с паузой после — вырезка паузы", () => {
    const ws = [w("w_000001", "а", 0, 400_000), w("w_000001.1", "б", 400_000, 400_000, "interpolated"), w("w_000002", "в", 500_000, 900_000)];
    expect(() => applyEdlOps(e1, [{ op: "add_cut", start_word_id: "w_000001.1", end_word_id: "w_000001.1" }], ws, F30)).toThrow(/empty_cut/);
    const d = applyEdlOps(e1, [{ op: "add_cut", start_word_id: "w_000001.1", end_word_id: "w_000001.1" }], ws, F30, { keepBeforeWordUs: 0 });
    expect(d.decisions.at(-1)).toMatchObject({ source_start_us: 400_000, source_end_us: 500_000 });
  });

  it("неизвестное слово и обратный порядок — ошибки", () => {
    expect(() => applyEdlOps(e1, [{ op: "add_cut", start_word_id: "w_000009", end_word_id: "w_000009" }], words, F30)).toThrow(/unknown_word/);
    expect(() => applyEdlOps(e1, [{ op: "add_cut", start_word_id: "w_000003", end_word_id: "w_000002" }], words, F30)).toThrow(/order/);
  });

  // Вырезка выравнивается по кадру: соседние слова задеты не больше чем на ½ кадра, само слово
  // вырезано целиком с той же точностью.
  for (const fps of [F30, { num: 30000, den: 1001 }, { num: 25, den: 1 }, { num: 24000, den: 1001 }] as Fps[]) {
    it(`границы на кадрах ${fps.num}/${fps.den}, соседние слова задеты ≤ ½ кадра`, () => {
      let seed = 7;
      const rnd = (n: number) => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) % n;
      const ws: TranscriptWord[] = [];
      let t = 0;
      for (let i = 1; i <= 300; i++) {
        const gap = rnd(4) === 0 ? 0 : rnd(250_000);
        const len = 50_000 + rnd(600_000); // длиннее кадра: короче — empty_cut, отдельный тест
        ws.push(w(`w_${String(i).padStart(6, "0")}`, `с${i}`, t + gap, t + gap + len));
        t += gap + len;
      }
      const half = (1e6 * fps.den) / fps.num / 2 + 1; // + 1 мкс: frameToUs округляет вверх
      for (let i = 1; i < ws.length - 1; i++) {
        const cut = applyEdlOps(edlDoc([]), [{ op: "add_cut", start_word_id: ws[i]!.id, end_word_id: ws[i]!.id }], ws, fps, { keepBeforeWordUs: 100_000 })
          .decisions.at(-1)!;
        expect(snapUsToFrame(cut.source_start_us, fps)).toBe(cut.source_start_us);
        expect(snapUsToFrame(cut.source_end_us, fps)).toBe(cut.source_end_us);
        expect(cut.source_start_us).toBeGreaterThanOrEqual(ws[i - 1]!.end_us - half);
        expect(cut.source_end_us).toBeLessThanOrEqual(ws[i + 1]!.start_us + half);
        expect(cut.source_start_us).toBeLessThanOrEqual(ws[i]!.start_us + half);
        expect(cut.source_end_us).toBeGreaterThanOrEqual(ws[i]!.end_us - half);
      }
    });
  }
});

describe("applyEdlOps: add_cut_range, remove, set_status", () => {
  it("add_cut_range — выровнена по кадрам и обрезана концом исходника", () => {
    const d = applyEdlOps(e1, [{ op: "add_cut_range", source_start_us: 4_010_000, source_end_us: 4_490_000 }], words, F30, { sourceDurationUs: DUR });
    expect(d.decisions.at(-1)).toMatchObject({ origin: "user", status: "accepted", reason: "manual", source_start_us: 4_000_000, source_end_us: 4_500_000 });
    expect(d.decisions.at(-1)!.start_word_id).toBeUndefined();
    const tail = applyEdlOps(e1, [{ op: "add_cut_range", source_start_us: 9_000_000, source_end_us: 12_000_000 }], words, F30, { sourceDurationUs: DUR });
    expect(tail.decisions.at(-1)).toMatchObject({ source_start_us: 9_000_000, source_end_us: DUR });
  });

  it("id новых решений уникальны в пределах документа и ревизий", () => {
    const a = applyEdlOps(e1, [{ op: "add_cut_range", source_start_us: 4_000_000, source_end_us: 4_500_000 }, { op: "add_cut_range", source_start_us: 5_000_000, source_end_us: 5_500_000 }], words, F30);
    const b = applyEdlOps(a, [{ op: "add_cut_range", source_start_us: 6_000_000, source_end_us: 6_500_000 }], words, F30);
    const all = b.decisions.map((x) => x.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(4);
  });

  it("remove: решение пользователя удаляется, детектора — rejected", () => {
    const a = applyEdlOps(e1, [{ op: "add_cut_range", source_start_us: 4_000_000, source_end_us: 4_500_000 }], words, F30);
    const userId = a.decisions.at(-1)!.id;
    const b = applyEdlOps(a, [{ op: "remove", decision_id: userId }, { op: "remove", decision_id: "d1" }], words, F30);
    expect(b.decisions).toEqual([{ ...e1.decisions[0], status: "rejected" }]);
  });

  it("неизвестное решение и пустая правка — ошибки", () => {
    expect(() => applyEdlOps(e1, [{ op: "set_status", decision_id: "dX", status: "accepted" }], words, F30)).toThrow(/unknown_decision/);
    expect(() => applyEdlOps(e1, [], words, F30)).toThrow(/empty_ops/);
  });
});

describe("слова-якоря после правки транскрипта", () => {
  it("решение остаётся по source-времени; удалённые якоря пересчитываются по словам внутри вырезки", () => {
    const e = edlDoc([dec("d1", { start_word_id: "w_000002", end_word_id: "w_000002", source_start_us: 400_000, source_end_us: 1_000_000 }),
      dec("d2", { start_word_id: "w_000003", end_word_id: "w_000004", source_start_us: 1_000_000, source_end_us: 3_400_000 })]);
    // «мир» заменён на «Claude Code» (вставки в промежутке 400–1000 мс), «дела» удалено
    const edited = [w("w_000001", "привет", 0, 400_000), w("w_000001.1", "Claude", 400_000, 700_000, "interpolated"),
      w("w_000001.2", "Code", 700_000, 1_000_000, "interpolated"), w("w_000003", "как", 1_000_000, 1_200_000), w("w_000005", "пока", 9_500_000, 9_900_000)];
    const r = reanchorDecisions(e.decisions, edited);
    expect(r[0]).toMatchObject({ start_word_id: "w_000001.1", end_word_id: "w_000001.2", source_start_us: 400_000, source_end_us: 1_000_000 });
    expect(r[1]).toMatchObject({ start_word_id: "w_000003", end_word_id: "w_000003", source_start_us: 1_000_000, source_end_us: 3_400_000 });
    // внутри вырезки слов не осталось — якоря сняты, вырезка по времени
    const r2 = reanchorDecisions([dec("d3", { start_word_id: "w_000004", end_word_id: "w_000004", source_start_us: 3_000_000, source_end_us: 3_400_000 })], edited);
    expect(r2[0]!.start_word_id).toBeUndefined();
    expect(r2[0]!.end_word_id).toBeUndefined();
    expect(r2[0]).toMatchObject({ source_start_us: 3_000_000, source_end_us: 3_400_000 });
    // якоря на месте — решение не меняется (тот же объект)
    expect(reanchorDecisions(e.decisions, words)[0]).toBe(e.decisions[0]);
  });
});

describe("saveEdlRevision / timelineFor", () => {
  let s: TestStore;
  let db: Db;
  let store: ArtifactStore;
  const deps = () => ({ db, store, root: s.root });
  const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
  const accept: EdlOp[] = [{ op: "set_status", decision_id: "d1", status: "accepted" }];

  beforeEach(async () => {
    s = await makeStore("ms-edit-edl-");
    db = openDb(s.root);
    await migrate(db);
    store = new ArtifactStore({ root: s.root, db, guard: s.guard });
    await seedVideo(db, store, s.root, { words, decisions: e1.decisions });
  });
  afterEach(async () => {
    db.close();
    await removeStore(s);
  });

  it("ревизия r2: файл, решения, таймлайн и клипы одной транзакцией; r1 неизменна", async () => {
    const r1File = join(s.root, artifactPaths(s.root, "p1").edlRev("edl_1", 1), "edl.json");
    const before = sha(r1File);
    const out = await saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: accept });
    expect(out.doc).toMatchObject({ revision: 2, parent_revision: 1, decisions: [{ id: "d1", status: "accepted" }] });
    expect(out.timeline).toEqual(buildTimeline(DUR, acceptedCuts(out.doc), F30));
    expect(edls.get(db, "edl_1")!.current_revision).toBe(2);
    expect(edls.decisions(db, "edl_1", 2).map((d) => [d.decision_id, d.status])).toEqual([["d1", "accepted"]]);
    expect(timelineFor(db, "edl_1")).toEqual(out.timeline);
    expect(timelineFor(db, "edl_1", 1)).toEqual(buildTimeline(DUR, [], F30));
    expect(sha(r1File)).toBe(before);
    const rev = edls.revision(db, "edl_1", 2)!;
    expect(rev.sha256).toBe(sha(join(s.root, rev.rel_path)));
    expect(currentEdl(db, s.root, "edl_1")).toEqual(out.doc);
  });

  it("base_revision ≠ current → revision_conflict; гонка двух правок одной базы — одна ревизия", async () => {
    const res = await Promise.allSettled([
      saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: accept }),
      saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: [{ op: "set_status", decision_id: "d1", status: "rejected" }] }),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((res.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "revision_conflict" });
    expect(edls.get(db, "edl_1")!.current_revision).toBe(2);
    await expect(saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: accept })).rejects.toThrow(/revision_conflict/);
  });

  it("правка, пока roughcut.propose держит замок EDL, → resource_busy", async () => {
    enqueue(db, { type: "roughcut.propose", projectId: "p1", input: {}, idempotencyKey: "rc" });
    claimNext(db, "srv", 0, { running: 0, maxRunning: 2 });
    await expect(saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: accept })).rejects.toMatchObject({ code: "resource_busy" });
    expect(edls.get(db, "edl_1")!.current_revision).toBe(1);
  });

  it("add_cut — по словам текущей ревизии транскрипта; удалённые правкой слова — unknown_word", async () => {
    await saveTranscriptRevision(deps(), "trn_1", { base_revision: 1, ops: [{ op: "replace_text", word_id: "w_000002", text: "Claude Code" }] });
    await expect(saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: [{ op: "add_cut", start_word_id: "w_000002", end_word_id: "w_000002" }] }))
      .rejects.toThrow(/unknown_word/);
    const out = await saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: [{ op: "add_cut", start_word_id: "w_000001.1", end_word_id: "w_000001.2" }] });
    expect(out.doc.decisions.at(-1)).toMatchObject({ start_word_id: "w_000001.1", end_word_id: "w_000001.2", source_start_us: 500_000, source_end_us: 900_000 });
  });

  it("якорь удалён правкой транскрипта: EDL и Approval A не меняются, следующая ревизия EDL пересчитывает якорь", async () => {
    const r2 = await saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: [{ op: "set_status", decision_id: "d1", status: "accepted" }, { op: "add_cut", start_word_id: "w_000004", end_word_id: "w_000004" }] });
    const cur = currentSubject(db, "p1", "A")!;
    approve(db, { projectId: "p1", kind: "A", subjectRef: cur.ref, subjectHash: cur.hash });
    expect(r2.doc.decisions.at(-1)).toMatchObject({ start_word_id: "w_000004", end_word_id: "w_000004", source_start_us: 3_000_000, source_end_us: 9_400_000 });
    await saveTranscriptRevision(deps(), "trn_1", { base_revision: 1, ops: [{ op: "replace_text", word_id: "w_000004", text: "дела-то идут" }] });
    expect(edls.get(db, "edl_1")!.current_revision).toBe(2);
    expect(approvalState(db, "p1", "A", currentSubject(db, "p1", "A")).state).toBe("valid");
    const r3 = await saveEdlRevision(deps(), "edl_1", { base_revision: 2, ops: [{ op: "set_status", decision_id: "d1", status: "accepted" }] });
    // «дела» удалено, «дела-то идут» вставлены на его время (3,0–3,4 с); вырезка по времени не сдвинулась
    expect(r3.doc.decisions.at(-1)).toMatchObject({ start_word_id: "w_000003.1", end_word_id: "w_000003.2", source_start_us: 3_000_000, source_end_us: 9_400_000 });
    expect(timelineFor(db, "edl_1", 3)).toEqual(timelineFor(db, "edl_1", 2));
  });

  it("новая ревизия EDL: Approval A → stale(subject_changed), B → stale(upstream_A) в той же транзакции", async () => {
    await saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: accept });
    const cur = currentSubject(db, "p1", "A")!;
    approve(db, { projectId: "p1", kind: "A", subjectRef: cur.ref, subjectHash: cur.hash });
    approve(db, { projectId: "p1", kind: "B", subjectRef: "plan:pln_1@r1", subjectHash: cur.hash });
    await saveEdlRevision(deps(), "edl_1", { base_revision: 2, ops: [{ op: "add_cut_range", source_start_us: 5_000_000, source_end_us: 6_000_000 }] });
    expect(approvalState(db, "p1", "A", currentSubject(db, "p1", "A"))).toMatchObject({ state: "stale", reason: "subject_changed" });
    expect(approvalState(db, "p1", "B", { ref: "plan:pln_1@r1", hash: cur.hash })).toMatchObject({ state: "stale", reason: "upstream_A" });
  });

  it("отказ сохранения (конфликт) не трогает approvals", async () => {
    await saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: accept });
    const cur = currentSubject(db, "p1", "A")!;
    approve(db, { projectId: "p1", kind: "A", subjectRef: cur.ref, subjectHash: cur.hash });
    approve(db, { projectId: "p1", kind: "B", subjectRef: "plan:pln_1@r1", subjectHash: cur.hash });
    await expect(saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: accept })).rejects.toThrow(/revision_conflict/);
    expect(approvalState(db, "p1", "A", cur).state).toBe("valid");
    expect(approvalState(db, "p1", "B", { ref: "plan:pln_1@r1", hash: cur.hash }).state).toBe("valid");
  });
});
