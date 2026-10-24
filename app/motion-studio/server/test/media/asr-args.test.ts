// Task 26: аргументы воркера ASR — массивом, без shell; hotwords и язык проверяются.
import { describe, expect, it } from "vitest";
import type { AsrConfig } from "../../src/config.js";
import { AsrInputError, HOTWORDS_PROMPT_BUDGET, WHISPER_LANGUAGES, asrEnv, buildAsrArgs, checkHotwords, checkLanguage, fitHotwords, workerPath } from "../../src/media/asr-adapter.js";

const cfg: AsrConfig = {
  python: "/py/bin/python", aiPlatformRoot: "/AIP", modelsDir: "/M", model: "whisper-large-v3-turbo", language: "ru",
  expectedWorkerSha256: "0".repeat(64), timeoutMs: 60_000, noOutputTimeoutMs: 10_000,
};

describe("buildAsrArgs", () => {
  it("как в плане: воркер, модель, аудио, выход, язык, разрезы, hotwords", () => {
    expect(buildAsrArgs(cfg, { audio: "/d/a.wav", out: "/d/w.json", language: "ru", splits: [281, 561.5], hotwords: ["Claude Code", "Remotion"] })).toEqual([
      "/AIP/app/platform/aiplatform/montage/asr_worker.py", "--kind", "whisper", "--model", "/M/asr/whisper-large-v3-turbo",
      "--audio", "/d/a.wav", "--out", "/d/w.json", "--language", "ru", "--splits", "281,561.5", "--hotwords", "Claude Code|Remotion"]);
  });

  it("без разрезов и hotwords — без этих флагов; модель из входа; разрезы — до мс", () => {
    expect(buildAsrArgs(cfg, { audio: "/d/a.wav", out: "/d/w.json", language: "en", splits: [], hotwords: [], model: "whisper-large-v3-mlx" })).toEqual([
      workerPath(cfg), "--kind", "whisper", "--model", "/M/asr/whisper-large-v3-mlx", "--audio", "/d/a.wav", "--out", "/d/w.json", "--language", "en"]);
    expect(buildAsrArgs(cfg, { audio: "/d/a.wav", out: "/d/w.json", language: "ru", splits: [290.123456, 580], hotwords: [] })).toContain("290.123,580");
  });

  it("относительные пути аудио и выхода — отказ (аргумент, похожий на флаг, не пройдёт)", () => {
    expect(() => buildAsrArgs(cfg, { audio: "-x", out: "/d/w.json", language: "ru", splits: [], hotwords: [] })).toThrow(AsrInputError);
    expect(() => buildAsrArgs(cfg, { audio: "/d/a.wav", out: "w.json", language: "ru", splits: [], hotwords: [] })).toThrow(AsrInputError);
  });
});

describe("checkHotwords / checkLanguage", () => {
  it("hotwords: обрезка пробелов, пустые выкинуты, без `|`, управляющих символов, ведущего «-», ограничения длины и числа", () => {
    expect(checkHotwords([" Claude Code ", "", "C++", "ёжик"])).toEqual(["Claude Code", "C++", "ёжик"]);
    for (const bad of [["a|b"], ["a\nb"], ["a\u0000"], ["\u001b[31m"], ["-rf"], ["x".repeat(65)], ["a\u2028b"], ["a\u2029b"]]) {
      expect(() => checkHotwords(bad), JSON.stringify(bad)).toThrow(AsrInputError);
    }
    expect(() => checkHotwords(Array.from({ length: 51 }, (_, i) => `w${i}`))).toThrow(/не больше 50/);
    expect(checkHotwords(Array.from({ length: 50 }, (_, i) => `w${i}`))).toHaveLength(50);
  });

  it("язык — код из списка языков whisper (mlx-audio)", () => {
    for (const ok of ["ru", "en", "uk", "yue", "haw"]) expect(checkLanguage(ok)).toBe(ok);
    expect(WHISPER_LANGUAGES).toHaveLength(100);
    for (const bad of ["", "RU", "russian", "-h", "r u", "ru\n", "../x", "xx", "rus", "eng", "zz"]) expect(() => checkLanguage(bad), bad).toThrow(AsrInputError);
  });

  it("ревью Task 26 (m9): hotwords укладываются в окно промпта whisper — хвост отбрасывается, оценка по байтам UTF-8", () => {
    expect(fitHotwords(["Claude Code", "Remotion"])).toEqual({ kept: ["Claude Code", "Remotion"], dropped: [] });
    const many = Array.from({ length: 50 }, (_, i) => `слово${i}`);
    const f = fitHotwords(many);
    expect(f.kept).toEqual(many.slice(0, f.kept.length));
    expect(f.dropped).toEqual(many.slice(f.kept.length));
    expect(Buffer.byteLength(" " + f.kept.join(", "))).toBeLessThanOrEqual(HOTWORDS_PROMPT_BUDGET);
    expect(Buffer.byteLength(" " + [...f.kept, f.dropped[0]].join(", "))).toBeGreaterThan(HOTWORDS_PROMPT_BUDGET);
    // buildAsrArgs не режет молча — отказ
    expect(() => buildAsrArgs(cfg, { audio: "/d/a.wav", out: "/d/w.json", language: "ru", splits: [], hotwords: many })).toThrow(/окно промпта/);
  });
});

describe("asrEnv", () => {
  it("минимальное окружение: allowlist childEnv + PYTHONNOUSERSITE и офлайн-флаги; секреты родителя не проходят", () => {
    const env = asrEnv({ PATH: "/usr/bin", HOME: "/Users/x", ANTHROPIC_API_KEY: "sk", PYTHONPATH: "/evil", HF_TOKEN: "t", AWS_SECRET_ACCESS_KEY: "s" }, "/store/run/tmp/x");
    expect(env).toEqual({
      PATH: "/usr/bin", HOME: "/Users/x", TMPDIR: "/store/run/tmp/x",
      PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1", HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", HF_DATASETS_OFFLINE: "1",
    });
  });
});
