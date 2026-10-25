// S7: имена файлов пакета экспорта — транслит начала фразы и номер сцены.
import { describe, expect, it } from "vitest";
import { displayName, fileNames, fileSlug, packageIdFor } from "../../src/script/package-names.js";

describe("fileSlug", () => {
  it("транслит первых слов до 40 символов, [a-z0-9-], без «-» по краям", () => {
    expect(fileSlug("Три вопроса, которые пережили смену реализации")).toBe("tri-voprosa-kotorye-perezhili-smenu");
    expect(fileSlug("С Go 1.24 — а он вышел")).toBe("s-go-1-24-a-on-vyshel");
    expect(fileSlug("В Go 1.24 map устроена заново")).toMatch(/^v-go-1-24/);
  });

  it("буквы ГОСТ 7.79-2000 Б (упрощённо): ж, х, ц, ч, ш, щ, ю, я, ё, й, ы, э, ъ/ь", () => {
    expect(fileSlug("Жёлтый хэш цепочки чаще шире щели")).toBe("zheltyy-khesh-tsepochki-chashche-shire");
    expect(fileSlug("юла ящик эхо подъезд соль")).toBe("yula-yashchik-ekho-podezd-sol");
  });

  it("пусто после очистки — scene; одно длинное слово обрезается до 40", () => {
    expect(fileSlug("«—»")).toBe("scene");
    expect(fileSlug("")).toBe("scene");
    const long = fileSlug("а".repeat(60));
    expect(long).toBe("a".repeat(40));
  });
});

describe("fileNames", () => {
  it("NN — 2 знака, 3 при числе сцен больше 99", () => {
    expect(fileNames(3, 12, "x")).toEqual({ mp4: "03_x.mp4", alpha: "03_x_alpha.mov" });
    expect(fileNames(3, 120, "x").mp4).toBe("003_x.mp4");
    expect(fileNames(12, 99, "go").alpha).toBe("12_go_alpha.mov");
  });
});

describe("displayName и id пакета", () => {
  it("<проект>_<16x9|9x16>_<дата>; символы, недопустимые в имени папки, заменены", () => {
    expect(displayName("Go map", "16:9", "2026-10-24T12:00:00.000Z")).toBe("Go map_16x9_2026-10-24");
    expect(displayName("a/b: c", "9:16", "2026-10-24T12:00:00.000Z")).toBe("a-b- c_9x16_2026-10-24");
    expect(displayName("  ", "16:9", "2026-10-24T12:00:00.000Z")).toBe("проект_16x9_2026-10-24");
  });

  it("дата — по местному времени, а не по UTC", () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = "Asia/Tokyo"; // UTC+9: 18:00Z — уже следующий день
      expect(displayName("Go map", "16:9", "2026-10-24T18:00:00.000Z")).toBe("Go map_16x9_2026-10-25");
      process.env.TZ = "America/Los_Angeles"; // UTC−7: 02:00Z — ещё предыдущий день
      expect(displayName("Go map", "16:9", "2026-10-24T02:00:00.000Z")).toBe("Go map_16x9_2026-10-23");
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  it("id пакета — от id задачи: повтор попытки публикует в тот же каталог", () => {
    expect(packageIdFor("job_01ABC")).toBe("pkg_01ABC");
    expect(packageIdFor("j1")).toBe("pkg_j1");
  });
});
