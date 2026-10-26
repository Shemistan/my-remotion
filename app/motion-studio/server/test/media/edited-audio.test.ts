// Task 36 (F2): смонтированная дорожка звука `edited-audio.wav` — 48 кГц, каналы как в
// источнике, pcm_s24le, длина ровно `round(duration_us · 48 000 / 1e6)` сэмплов, склейки по
// сэмплам (`buildAudioFilter`). Реальный ffmpeg на синтетическом источнике 44,1 кГц стерео.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTimeline } from "@ms/contracts";
import { sha256File } from "../../src/scenes/hash.js";
import { EDITED_AUDIO_RATE, buildEditedAudio, wavInfo } from "../../src/media/edited-audio.js";
import { REPO_TMP } from "../db/helpers.js";
import { F30 } from "../edit/helpers.js";

const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args]);
let tmp: string;
let src: string;
let short: string;
let tone: string;

beforeAll(async () => {
  await mkdir(REPO_TMP, { recursive: true });
  tmp = await mkdtemp(join(REPO_TMP, "ms-edited-audio-"));
  src = join(tmp, "src.mp4");
  short = join(tmp, "short.mp4");
  // тишина 10 с, импульс 10 мс на 5,000 с источника; видео 64×64 рядом (как у настоящего исходника)
  ff(["-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=10", "-f", "lavfi", "-i", "aevalsrc='if(between(t,5,5.01),0.8*sin(2*PI*1000*t),0)|if(between(t,5,5.01),0.8*sin(2*PI*1000*t),0)':s=44100:d=10",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "pcm_s16le", "-shortest", join(tmp, "src.mov")]);
  ff(["-i", join(tmp, "src.mov"), "-c:v", "copy", "-c:a", "alac", src]);
  // звук короче видео: 9 с из 10
  ff(["-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=9",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ac", "1", short]);
  // тон 10 с — для окна: вне окна тишина
  tone = join(tmp, "tone.wav");
  ff(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=10", "-c:a", "pcm_s16le", tone]);
}, 30_000);
afterAll(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

/** Последний сэмпл 24-бит PCM первого канала по модулю выше `level`. */
function lastLoud(path: string, level: number): number {
  const buf = readFileSync(path);
  const info = wavInfo(buf);
  for (let i = info.samples - 1; i >= 0; i--) {
    const off = info.dataOffset + i * info.blockAlign;
    if (Math.abs(buf.readIntLE(off, 3)) / 0x800000 > level) return i;
  }
  return -1;
}

/** Первый сэмпл 24-бит PCM первого канала по модулю выше `level` (доля полной шкалы). */
function firstLoud(path: string, level: number): number {
  const buf = readFileSync(path);
  const info = wavInfo(buf);
  for (let i = 0; i < info.samples; i++) {
    const off = info.dataOffset + i * info.blockAlign;
    if (Math.abs(buf.readIntLE(off, 3)) / 0x800000 > level) return i;
  }
  return -1;
}

describe("buildEditedAudio", () => {
  it("вырезка 2,0–3,5 с: 48 кГц стерео s24, длина по таймлайну, импульс 5,0 с источника — на 3,5 с монтажа", async () => {
    const tl = buildTimeline(10_000_000, [{ start_us: 2_000_000, end_us: 3_500_000 }], F30);
    const out = join(tmp, "edited.wav");
    const r = await buildEditedAudio({ input: src, tl, fadeUs: 8_000, out, signal: new AbortController().signal });
    expect(r.path).toBe(out);
    expect(r.samples).toBe(Math.round((tl.duration_us * EDITED_AUDIO_RATE) / 1e6));
    expect(r.samples).toBe(408_000);
    expect(r.sha256).toBe(await sha256File(out));
    const s = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", out]).toString()).streams[0];
    expect([s.codec_name, Number(s.sample_rate), s.channels]).toEqual(["pcm_s24le", 48_000, 2]);
    // ±1 мс: передискретизация 44,1 → 48 кГц размывает фронт
    expect(Math.abs(firstLoud(out, 0.2) - 168_000)).toBeLessThanOrEqual(48);
  });

  it("звук короче ролика: хвост — тишина до длины таймлайна; моно остаётся моно", async () => {
    const tl = buildTimeline(10_000_000, [], F30);
    const r = await buildEditedAudio({ input: short, tl, fadeUs: 8_000, out: join(tmp, "short.wav"), signal: new AbortController().signal });
    expect(r.samples).toBe(480_000);
    const s = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", r.path]).toString()).streams[0];
    expect(s.channels).toBe(1);
  });

  it("существующий выход не перезаписывается; отмена — до запуска", async () => {
    const tl = buildTimeline(10_000_000, [], F30);
    await expect(buildEditedAudio({ input: src, tl, fadeUs: 8_000, out: join(tmp, "edited.wav"), signal: new AbortController().signal })).rejects.toThrow();
    const ac = new AbortController();
    ac.abort();
    await expect(buildEditedAudio({ input: src, tl, fadeUs: 8_000, out: join(tmp, "x.wav"), signal: ac.signal })).rejects.toThrow(/отмен/);
  });

  it("окно (превью в контексте): длина та же, звук только в окне и на своих местах", async () => {
    const cut = buildTimeline(10_000_000, [{ start_us: 2_000_000, end_us: 3_500_000 }], F30);
    const r = await buildEditedAudio({ input: src, tl: cut, fadeUs: 8_000, out: join(tmp, "win-cut.wav"), window: { startUs: 3_000_000, endUs: 4_000_000 }, signal: new AbortController().signal });
    expect(r.samples).toBe(408_000);
    expect(Math.abs(firstLoud(r.path, 0.2) - 168_000)).toBeLessThanOrEqual(48);

    const tl = buildTimeline(10_000_000, [], F30);
    const w = await buildEditedAudio({ input: tone, tl, fadeUs: 8_000, out: join(tmp, "win-tone.wav"), window: { startUs: 4_000_000, endUs: 5_000_000 }, signal: new AbortController().signal });
    expect(w.samples).toBe(480_000);
    // вне окна — тишина (±1 мс на фейд), внутри — тон
    expect(Math.abs(firstLoud(w.path, 0.01) - 192_000)).toBeLessThanOrEqual(480);
    expect(Math.abs(lastLoud(w.path, 0.01) - 240_000)).toBeLessThanOrEqual(480);
  });
});
