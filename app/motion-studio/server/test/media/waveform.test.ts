import { expect, it } from "vitest";
import { pcmFromWav, peaksFromPcm } from "../../src/media/waveform.js";

const alternating = (n: number, amp: number) => Int16Array.from({ length: n }, (_, i) => (i % 2 === 0 ? -amp : amp));

it("пары min/max на ведро 10 мс, масштаб /256", () => {
  expect(Array.from(peaksFromPcm(alternating(1600, 16384), 16000, 10)).slice(0, 4)).toEqual([-64, 64, -64, 64]);
  expect(peaksFromPcm(alternating(1600, 16384), 16000, 10).length).toBe(20);
});
it("неполное последнее ведро и крайние значения", () => {
  const p = peaksFromPcm(Int16Array.from([-32768, 32767, 0]), 16000, 10);
  expect(Array.from(p)).toEqual([-128, 127]);
  expect(peaksFromPcm(new Int16Array(0), 16000, 10).length).toBe(0);
});
it("WAV: данные чанка data (после LIST), s16le моно", () => {
  const samples = Int16Array.from([1, -2, 300]);
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(1, 8); fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(16000, 12); fmt.writeUInt32LE(32000, 16); fmt.writeUInt16LE(2, 20); fmt.writeUInt16LE(16, 22);
  const list = Buffer.concat([Buffer.from("LIST"), Buffer.from([4, 0, 0, 0]), Buffer.from("INFO")]);
  const dataHdr = Buffer.alloc(8); dataHdr.write("data", 0); dataHdr.writeUInt32LE(6, 4);
  const body = Buffer.concat([Buffer.from("WAVE"), fmt, list, dataHdr, Buffer.from(samples.buffer)]);
  const head = Buffer.alloc(8); head.write("RIFF", 0); head.writeUInt32LE(body.length + 4, 4);
  const r = pcmFromWav(Buffer.concat([head, body]));
  expect(r.sampleRate).toBe(16000);
  expect(Array.from(r.pcm)).toEqual([1, -2, 300]);
  expect(() => pcmFromWav(Buffer.from("nope"))).toThrow(/WAV/);
});
