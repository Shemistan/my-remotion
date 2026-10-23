// Миниатюры таймлайна (Task 25): кадр раз в `everyUs` высотой 180 px из прокси.
import { readdir } from "node:fs/promises";

export const THUMB_HEIGHT = 180;

export interface ThumbsIndex {
  every_us: number;
  count: number;
  height: number;
}

export function thumbsArgs(input: string, outDir: string, everyUs: number, height: number = THUMB_HEIGHT): string[] {
  return [
    "-protocol_whitelist", "file", "-i", `file:${input}`,
    "-map", "0:v:0",
    "-vf", `fps=1000000/${everyUs},scale=-2:${height}`,
    "-q:v", "5",
    "-n", `${outDir}/%06d.jpg`,
  ];
}

export async function countThumbs(dir: string): Promise<number> {
  return (await readdir(dir)).filter((n) => /^\d{6}\.jpg$/.test(n)).length;
}
