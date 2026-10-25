// Task 5L: шпаргалка папки клипов видеопроекта — строки из манифеста (таймкоды ролика и исходника
// ЧЧ:ММ:СС:КК, фраза, режим/зона, C, короткие замечания), «не вошли» на своём месте, md/csv/txt.
import { describe, expect, it } from "vitest";
import { type VideoPackageManifest, VideoPackageManifestSchema } from "@ms/contracts";
import { CHEAT_NOTES_MAX } from "../../src/script/cheatsheet.js";
import { timecode, videoCheatRows, videoCheatsheet } from "../../src/video-scenes/cheatsheet.js";

const SHA = "c".repeat(64);
const F30 = { num: 30, den: 1 };
const probe = { durationMs: 3100, width: 1920, height: 1080, fps: F30, codec: "h264", audioCodec: "aac" };
const file = (f: string) => ({ file: f, export_id: "exp_1", sha256: SHA, ffprobe: probe });

function manifest(over: Partial<VideoPackageManifest> = {}): VideoPackageManifest {
  return VideoPackageManifestSchema.parse({
    schema_version: 1, package_id: "pkg_1", project_id: "p1", project_title: "Протокол", name: "Протокол_клипы_2026-10-26", fps: F30,
    edl: { id: "edl_1", revision: 15 }, plan: { id: "pln_1", revision: 16 },
    scenes: [
      {
        n: 1, item_id: "sp_009", scene_id: "scn_a", version_id: "ver_a", version_number: 1, approved: true,
        // 63,7–66,8 с ролика; в исходнике 73,48–101,31 с (между ними вырезки)
        source: { start_us: 73_480_000, end_us: 101_306_666 }, edited: { start_us: 63_700_000, end_us: 66_800_000 }, frames: { start: 1911, end: 2004 },
        quote: "работать дальше, не прерывая соединения.", mode: "overlay", zone: "left_third",
        mp4: file("01_rabotat-dalshe.mp4"), alpha: file("01_rabotat-dalshe_alpha.mov"), warnings: ["overlay_haze: дымка 60 %"], duration_frames: 93,
      },
      {
        n: 3, item_id: "sp_003", scene_id: "scn_c", version_id: "ver_c", version_number: 2, approved: false,
        source: { start_us: 163_480_000, end_us: 170_200_000 }, edited: { start_us: 109_533_333, end_us: 113_200_000 }, frames: { start: 3286, end: 3396 },
        quote: "Такая схема называется sequence diagram.", mode: "fullscreen", zone: "full",
        mp4: file("03_takaya-skhema.mp4"), alpha: null, warnings: ["duration_off_plan: длительность не по плану: 4,0 с вместо 3,7 с"], duration_frames: 120,
      },
    ],
    missing: [{ item_id: "sp_002", quote: "Поэтому получатель сначала дочитывает", reason: "не утверждена (C)", n: 2, source: { start_us: 122_740_000, end_us: 132_280_000 }, frames: { start: 2623, end: 2850 } }],
    created_at: "2026-10-26T10:00:00.000Z",
    ...over,
  });
}

describe("timecode", () => {
  it("кадр → ЧЧ:ММ:СС:КК по номинальному fps (29,97 — как NDF монтажки)", () => {
    expect(timecode(0, F30)).toBe("00:00:00:00");
    expect(timecode(1911, F30)).toBe("00:01:03:21");
    expect(timecode(30 * 3600 + 29, F30)).toBe("01:00:00:29");
    expect(timecode(25 * 61 + 3, { num: 25, den: 1 })).toBe("00:01:01:03");
    expect(timecode(30 * 60, { num: 30000, den: 1001 })).toBe("00:01:00:00");
  });
});

describe("videoCheatRows", () => {
  it("строки по номеру сцены: ролик — кадры плана и длительность файла, исходник — source; «не вошли» на своём месте", () => {
    const rows = videoCheatRows(manifest());
    expect(rows.map((r) => [r.nn, r.mp4, r.alpha])).toEqual([
      ["01", "01_rabotat-dalshe.mp4", "01_rabotat-dalshe_alpha.mov"],
      ["02", null, null],
      ["03", "03_takaya-skhema.mp4", null],
    ]);
    const [a, m, c] = rows;
    expect(a).toMatchObject({
      edited: { start: "00:01:03:21", end: "00:01:06:24" }, source: { start: "00:01:13:14", end: "00:01:41:10" },
      duration_s: 3.1, mode: "поверх видео · левая треть", approved: true,
    });
    // в исходнике между началом и концом есть вырезки — человеку видно, что кусок не сплошной
    expect(a!.notes).toEqual(["в исходнике есть вырезки", "дымка в альфа-версии"]);
    expect(m).toMatchObject({ edited: { start: "00:01:27:13", end: "00:01:35:00" }, source: { start: "00:02:02:22", end: "00:02:12:09" }, duration_s: null, approved: false });
    expect(m!.notes).toEqual(["не вошла: не утверждена (C)"]);
    // fullscreen: альфы нет с причиной; не утверждена; длительность файла не по плану — конец по файлу
    expect(c).toMatchObject({ edited: { start: "00:01:49:16", end: "00:01:53:16" }, duration_s: 4, mode: "на весь кадр", approved: false });
    expect(c!.notes).toEqual(["без альфы: сцена на весь кадр", "не утверждена (C)", "длительность не по плану: 4,0 с вместо 3,7 с"]);
    expect(rows.every((r) => r.notes.length <= CHEAT_NOTES_MAX)).toBe(true);
  });

  it("альфа не экспортирована — короткая причина из «не вошли» той же сцены; сцена в missing без номера — в конце", () => {
    const base = manifest();
    const rows = videoCheatRows(manifest({
      scenes: [{ ...base.scenes[0]!, alpha: null }],
      missing: [
        { item_id: "sp_009", reason: "альфа-версия невозможна: сцена закрывает кадр", detail: "overlay_opaque: …" },
        { item_id: "sp_777", quote: "Старая", reason: "сцена устарела" },
      ],
    }));
    expect(rows.map((r) => r.nn)).toEqual(["01", "—"]);
    expect(rows[0]!.notes[0]).toBe("альфа-версия невозможна: сцена закрывает кадр");
    expect(rows[1]).toMatchObject({ mp4: null, quote: "Старая", edited: null, source: null, notes: ["не вошла: сцена устарела"] });
  });
});

describe("videoCheatsheet", () => {
  const rows = videoCheatRows(manifest());
  const info = { project: "Протокол", fps: F30 };

  it("md: заголовок с подсказкой, таблица клипов (строк = сцен), «не вошли» отдельной таблицей", () => {
    const md = videoCheatsheet(rows, "md", info);
    expect(md).toMatch(/^# Шпаргалка: клипы ↔ ролик/);
    expect(md).toContain("fps 30");
    expect(md).toContain("ЧЧ:ММ:СС:КК");
    expect(md).toContain("_alpha.mov");
    const lines = md.split("\n");
    const head = lines.findIndex((l) => l.startsWith("| № |"));
    expect(lines[head]).toBe("| № | ролик: начало | ролик: конец | исходник: начало | исходник: конец | длит., с | файл MP4 (на весь кадр) | файл с альфой (поверх видео) | фраза | режим | утверждена (C) | замечания |");
    const clipRows = lines.slice(head + 2, lines.indexOf("", head));
    expect(clipRows).toHaveLength(2);
    expect(clipRows[0]).toBe("| 01 | 00:01:03:21 | 00:01:06:24 | 00:01:13:14 | 00:01:41:10 | 3,1 | 01_rabotat-dalshe.mp4 | 01_rabotat-dalshe_alpha.mov | работать дальше, не прерывая соединения. | поверх видео · левая треть | да | в исходнике есть вырезки; дымка в альфа-версии |");
    expect(clipRows[1]).toContain("| 03_takaya-skhema.mp4 | — | Такая схема называется sequence diagram. | на весь кадр | нет |");
    expect(md).toMatch(/## Не вошли в папку \(1\)/);
    expect(md).toContain("| 02 | 00:01:27:13 | Поэтому получатель сначала дочитывает | не утверждена (C) |");
  });

  it("csv: BOM, «;», строк = сцен + заголовок; txt: строка на сцену", () => {
    const csv = videoCheatsheet(rows, "csv", info);
    expect(csv.startsWith("﻿№;ролик: начало;")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(1 + 3);
    expect(lines[2]).toBe("02;00:01:27:13;00:01:35:00;00:02:02:22;00:02:12:09;—;—;—;Поэтому получатель сначала дочитывает;—;нет;не вошла: не утверждена (C)");
    const txt = videoCheatsheet(rows, "txt", info);
    expect(txt.trimEnd().split("\n")).toEqual([
      "01 · ролик 00:01:03:21–00:01:06:24 · исходник 00:01:13:14–00:01:41:10 · 3,1 с · поверх видео · левая треть · C: да · «работать дальше, не прерывая соединения.» · 01_rabotat-dalshe.mp4 + 01_rabotat-dalshe_alpha.mov",
      "02 · ролик 00:01:27:13–00:01:35:00 · исходник 00:02:02:22–00:02:12:09 · «Поэтому получатель сначала дочитывает» · не вошла: не утверждена (C)",
      "03 · ролик 00:01:49:16–00:01:53:16 · исходник 00:02:43:14–00:02:50:06 · 4,0 с · на весь кадр · C: нет · «Такая схема называется sequence diagram.» · 03_takaya-skhema.mp4",
    ]);
  });
});
