import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type RuleId, type Violation, checkSceneDir, checkSceneSource } from "../../src/scenes/static-check.js";

const BAD = fileURLToPath(new URL("../fixtures/bad-scenes/", import.meta.url));
const RENDER_FIXTURES = fileURLToPath(new URL("../../../render/test/fixtures/", import.meta.url));
const REPO_TMP = fileURLToPath(new URL("../../../../../tmp/", import.meta.url));

const check = (text: string, path = "src/Scene.tsx") => checkSceneSource([{ path, text }]);
/** Уникальные правила в порядке первого появления. */
const rules = (v: Violation[]): RuleId[] => [...new Set(v.map((x) => x.rule))];

const okScene = `
import { AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { useMemo } from "react";
import { presets } from "@ms/motion-kit";
import { Title } from "./parts/Title";

export const Scene = () => {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const x = interpolate(frame, [0, 30], [0, 100], clamp);
  const jitter = useMemo(() => random("seed") * 10, []);
  const launch = new Date(Date.UTC(2024, 0, 1)).getUTCFullYear();
  return (
    <AbsoluteFill style={{ background: presets["dark-premium"].palette.bg, opacity: Math.min(1, frame / 30) }}>
      <Img src={staticFile("logo.png")} style={{ transform: \`translateX(\${x + jitter}px)\` }} />
      <img src="./parts/dot.png" />
      <Title text={String(launch)} className="text-xl font-bold" />
    </AbsoluteFill>
  );
};
`;

describe("checkSceneSource: минимум брифа", () => {
  it("framer-motion, gsap и поднятый в корень zod — вне allowlist", () => {
    expect(rules(check("import { motion } from 'framer-motion'"))).toEqual(["import-not-allowed"]);
    expect(rules(check("import gsap from 'gsap'"))).toEqual(["import-not-allowed"]);
    expect(rules(check("import z from 'zod'"))).toEqual(["import-not-allowed"]);
  });
  it("динамический import", () => {
    expect(rules(check("const m = await import('./x')"))).toEqual(["dynamic-import"]);
  });
  it("Math.random и fetch", () => {
    expect(rules(check("const r = Math.random()"))).toEqual(["forbidden-global"]);
    expect(rules(check("fetch('https://x')"))).toEqual(["forbidden-global"]);
  });
  it("CSS transition в style и animate- в className", () => {
    expect(rules(check("<div style={{ transition: 'all 1s' }} />"))).toEqual(["forbidden-css-animation"]);
    expect(rules(check('<div className="animate-pulse" />'))).toEqual(["forbidden-css-animation"]);
  });
  it("относительный импорт за пределы src/", () => {
    expect(rules(check("import x from '../../outside'"))).toEqual(["outside-src"]);
  });
  it("корректная сцена проходит", () => {
    expect(check(okScene)).toEqual([]);
  });
});

describe("bad-scenes: по одному нарушению на файл", async () => {
  const names = (await readdir(BAD)).filter((n) => n.endsWith(".tsx")).sort();
  it("фикстуры на месте", () => expect(names.length).toBeGreaterThanOrEqual(10));
  for (const name of names) {
    it(name, async () => {
      const text = await readFile(join(BAD, name), "utf8");
      const v = checkSceneSource([{ path: "src/Scene.tsx", text }]);
      expect(v.map((x) => x.rule)).toEqual([name.split(".")[0]]);
    });
  }
});

describe("Violation: файл, строка, сообщение для агента", () => {
  it("строка 1-based и путь файла", () => {
    const v = check("import { a } from 'remotion';\n\nconst r = Math.random();\n", "src/parts/A.tsx");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: "forbidden-global", file: "src/parts/A.tsx", line: 3 });
  });
  it("сообщения по-русски и говорят, чем заменить", () => {
    expect(check("Math.random()")[0]!.message).toContain("random('seed')");
    expect(check("setTimeout(() => 1, 10)")[0]!.message).toContain("useCurrentFrame");
    expect(check("import gsap from 'gsap'")[0]!.message).toMatch(/gsap.*remotion/s);
    expect(check("<div style={{ transition: 'all 1s' }} />")[0]!.message).toContain("interpolate");
    expect(check("<img src='https://x/a.png' />")[0]!.message).toContain("staticFile");
    expect(check("const d = new Date()")[0]!.message).toMatch(/[а-я]/);
  });
});

/** Таблица случаев: код → ожидаемые правила (уникальные, в порядке появления). */
type Case = [name: string, code: string, expected: RuleId[]];

const cases: Record<string, Case[]> = {
  "обход через алиасы глобалов": [
    ["const f = fetch", "const f = fetch; f('/x')", ["forbidden-global"]],
    ["window.fetch", "window.fetch('/x')", ["forbidden-global"]],
    ["globalThis['fetch']", "globalThis['fetch']('/x')", ["forbidden-global"]],
    ["self.fetch", "self.fetch('/x')", ["forbidden-global"]],
    ["(0, eval)", "(0, eval)('1')", ["forbidden-global"]],
    ["shorthand { fetch }", "const o = { fetch }; o.fetch('/x')", ["forbidden-global"]],
    ["export { setTimeout as t }", "export { setTimeout as t }", ["forbidden-global"]],
    ["typeof window", "const w = typeof window !== 'undefined'", ["forbidden-global"]],
    ["document.title", "const t = document.title", ["forbidden-global"]],
    ["top/parent/frames", "const p = parent.frames", ["forbidden-global"]],
    ["global (полифилл webpack)", "global.fetch('/x')", ["forbidden-global"]],
    ["crypto.randomUUID", "const id = crypto.randomUUID()", ["forbidden-global"]],
    ["new Image()", "const i = new Image()", ["forbidden-global"]],
    ["RTCPeerConnection", "const c = new RTCPeerConnection()", ["forbidden-global"]],
    ["this в функции", "function f() { return this }", ["forbidden-global"]],
    ["this на верхнем уровне", "const g = this", ["forbidden-global"]],
  ],
  "локальные имена и ambient-объявления": [
    ["локальный fetch затеняет глобал", "const fetch = (n: number) => n; fetch(1)", []],
    ["параметр window", "function f(window: number) { return window }", []],
    ["локальная переменная parent", "const parent = { id: 1 }; const id = parent.id", []],
    ["declare const fetch", "declare const fetch: (u: string) => void; fetch('/x')", ["forbidden-global"]],
    ["declare global", "declare global { var fetch: (u: string) => void }\nfetch('/x')", ["forbidden-global"]],
    ["свойство obj.fetch", "const api = { fetch: (n: number) => n }; api.fetch(1)", []],
    ["this в методе класса", "class A { x = 1; get() { return this.x } }", []],
    ["this в стрелке внутри метода", "class A { x = 1; get() { return [1].map(() => this.x) } }", []],
  ],
  "Math и Date": [
    ["Math['random']", "Math['random']()", ["forbidden-global"]],
    ["алиас const M = Math", "const M = Math; M.random()", ["forbidden-global"]],
    ["деструктуризация Math", "const { random } = Math", ["forbidden-global"]],
    ["Math.floor", "const a = Math.floor(1.5) + Math['max'](1, 2) + Math.PI", []],
    ["Date.now()", "const t = Date.now()", ["forbidden-global"]],
    ["Date['now']", "const t = Date['now']()", ["forbidden-global"]],
    ["new Date()", "const d = new Date()", ["forbidden-global"]],
    ["new Date без скобок", "const d = new Date", ["forbidden-global"]],
    ["new Date(...spread)", "const a: [] = []; const d = new Date(...a)", ["forbidden-global"]],
    ["Date() без new", "const s = Date()", ["forbidden-global"]],
    ["алиас const D = Date", "const D = Date; const d = new D()", ["forbidden-global"]],
    ["new Date(фиксированная)", "const d = new Date(2024, 0, 1); const e = new Date('2024-01-01')", []],
    ["Date.UTC и Date.parse", "const a = Date.UTC(2024, 0, 1) + Date.parse('2024-01-01')", []],
    ["performance.now()", "const t = performance.now()", ["forbidden-global"]],
  ],
  "eval и Function": [
    ["new Function", "const f = new Function('return 1')", ["forbidden-global"]],
    ["Function(...)", "Function('return 1')()", ["forbidden-global"]],
    ["тип Function допустим", "let f: Function | undefined; f = undefined", []],
    ["конструктор через .constructor", "const F = [].constructor.constructor", ["forbidden-global"]],
    ["конструктор через ['constructor']", "const F = (() => 1)['constructor']", ["forbidden-global"]],
    ["__proto__", "const p = ({}).__proto__", ["forbidden-global"]],
    ["import.meta", "const u = import.meta.url", ["forbidden-global"]],
    ["require", "const fs = require('fs')", ["forbidden-global"]],
    ["require через алиас", "const r = require; r('fs')", ["forbidden-global"]],
    ["module.require", "module.require('fs')", ["forbidden-global"]],
    ["__webpack_require__", "__webpack_require__(1)", ["forbidden-global"]],
    ["import = require", "import fs = require('fs')", ["forbidden-global"]],
  ],
  "спецификаторы импорта и реэкспорт": [
    ["шаблонная строка в статическом import", "import z from `zod`", ["syntax-error"]],
    ["шаблонная строка в import()", "const m = import(`./x`)", ["dynamic-import"]],
    ["import() разрешённого модуля", "const m = await import('remotion')", ["dynamic-import"]],
    ["import() в выражении", "const z = import('zod')", ["dynamic-import"]],
    ["import('x') в позиции типа", "type T = import('zod').ZodType; let t: T | undefined", []],
    ["import type", "import type { ZodType } from 'zod'; let t: ZodType | undefined", []],
    ["export type from", "export type { ZodType } from 'zod'", []],
    ["import { type X } не стирается целиком", "import { type ZodType } from 'zod'", ["import-not-allowed"]],
    ["export * from запрещённого", "export * from 'zod'", ["import-not-allowed"]],
    ["export { a } from запрещённого", "export { a } from 'gsap'", ["import-not-allowed"]],
    ["export * as ns from запрещённого", "export * as ns from 'gsap'", ["import-not-allowed"]],
    ["export { a } from за пределы src", "export { a } from '../../x'", ["outside-src"]],
    ["export * from локального", "export * from './parts/ok'", []],
    ["import side-effect", "import 'gsap'", ["import-not-allowed"]],
    ["node:fs", "import fs from 'node:fs'", ["import-not-allowed"]],
    ["подпуть remotion", "import { x } from 'remotion/no-react'", ["import-not-allowed"]],
    ["подпуть motion-kit", "import { x } from '@ms/motion-kit/internal'", ["import-not-allowed"]],
    ["webpack-лоадер в спецификаторе", "import t from '!!raw-loader!./a.txt'", ["import-not-allowed"]],
    ["абсолютный путь", "import x from '/etc/passwd'", ["outside-src"]],
    ["file: URL", "import x from 'file:///etc/passwd'", ["import-not-allowed"]],
    ["разрешённые модули", "import 'react'; import { jsx } from 'react/jsx-runtime'; import { loadFont } from '@remotion/fonts'; import { useCurrentFrame } from 'remotion'; import { presets } from '@ms/motion-kit'", []],
    ["ассет из src", "import dot from './dot.png'; import data from './data/points.json'", []],
    ["/// <reference>", "/// <reference path=\"../../x.d.ts\" />\nconst a = 1", ["import-not-allowed"]],
  ],
  "DOM и опасный HTML": [
    ["document.createElement('script')", "document.createElement('script')", ["forbidden-global", "forbidden-dom"]],
    ["React.createElement('script')", "import React from 'react'; React.createElement('script', null)", ["forbidden-dom"]],
    ["jsx('iframe')", "import { jsx } from 'react/jsx-runtime'; jsx('iframe', {})", ["forbidden-dom"]],
    ["<script>", "<script>{'x'}</script>", ["forbidden-dom"]],
    ["<iframe>", "<iframe src='./a.html' />", ["forbidden-dom"]],
    ["<style>", "<style>{'.a{}'}</style>", ["forbidden-dom"]],
    ["dangerouslySetInnerHTML", "<div dangerouslySetInnerHTML={{ __html: '<b>x</b>' }} />", ["forbidden-dom"]],
    ["dangerouslySetInnerHTML в объекте props", "const p = { dangerouslySetInnerHTML: { __html: '' } }", ["forbidden-dom"]],
    ["srcDoc", "<iframe srcDoc='<b>x</b>' />", ["forbidden-dom"]],
    ["ref → ownerDocument", "const f = (el: HTMLElement) => el.ownerDocument", ["forbidden-dom"]],
    ["ref → getRootNode", "const f = (el: HTMLElement) => el.getRootNode()", ["forbidden-dom"]],
    ["innerHTML", "const f = (el: HTMLElement) => { el.innerHTML = '<img>' }", ["forbidden-dom"]],
    ["деструктуризация defaultView", "const f = (d: { defaultView: unknown }) => { const { defaultView } = d; return defaultView }", ["forbidden-dom"]],
  ],
  "внешние URL": [
    ["<img src=https>", "<img src='https://x/a.png' />", ["external-url"]],
    ["<video src=http>", "<video src='http://x/a.mp4' />", ["external-url"]],
    ["протокол-относительный", "<img src='//cdn.x/a.png' />", ["external-url"]],
    ["<link>", "<link rel='stylesheet' href='./a.css' />", ["external-url"]],
    ["url() в style", "<div style={{ backgroundImage: 'url(https://x/a.png)' }} />", ["external-url"]],
    ["url(\"//...\") в style", "<div style={{ backgroundImage: 'url(\"//x/a.png\")' }} />", ["external-url"]],
    ["URL в константе", "const SRC = 'https://x/a.png'; const e = <img src={SRC} />", ["external-url"]],
    ["URL в шаблонной строке", "const n = 1; const e = <img src={`https://x/${n}.png`} />", ["external-url"]],
    ["ws://", "const u = 'wss://x/socket'", ["external-url"]],
    ["javascript:", "<a href='javascript:void 0'>x</a>", ["external-url"]],
    ["loadFont с внешним url", "import { loadFont } from '@remotion/fonts'; loadFont({ family: 'X', url: 'https://x/f.woff2' })", ["external-url"]],
    ["staticFile", "import { Img, staticFile } from 'remotion'; const e = <Img src={staticFile('a.png')} />", []],
    ["относительный путь", "<img src='./a.png' />", []],
    ["url() локальный", "<div style={{ backgroundImage: 'url(./a.png)' }} />", []],
    ["data: URL", "<img src='data:image/png;base64,AAAA' />", []],
  ],
  "CSS-анимации": [
    ["animation в style", "<div style={{ animation: 'spin 1s' }} />", ["forbidden-css-animation"]],
    ["WebkitTransition", "<div style={{ WebkitTransition: 'opacity 1s' }} />", ["forbidden-css-animation"]],
    ["transitionDuration shorthand", "const transitionDuration = '1s'; const s = { transitionDuration }", ["forbidden-css-animation"]],
    ["'transition-duration'", "const s = { 'transition-duration': '1s' }", ["forbidden-css-animation"]],
    ["style.transition =", "const f = (el: HTMLElement) => { el.style.transition = 'all 1s' }", ["forbidden-css-animation"]],
    ["el.animate()", "const f = (el: HTMLElement) => el.animate([], 100)", ["forbidden-css-animation"]],
    ["@keyframes в строке", "const css = '@keyframes spin { from { opacity: 0 } }'", ["forbidden-css-animation"]],
    ["cssText с transition", "const css = 'opacity: 1; transition: opacity 1s'", ["forbidden-css-animation"]],
    ["className transition-opacity", "<div className='p-2 transition-opacity' />", ["forbidden-css-animation"]],
    ["className transition", "<div className='transition' />", ["forbidden-css-animation"]],
    ["className с вариантом hover:animate-spin", "<div className='hover:animate-spin' />", ["forbidden-css-animation"]],
    ["className-шаблон", "const a = 'x'; const e = <div className={`p-2 ${a} animate-bounce`} />", ["forbidden-css-animation"]],
    ["className через cn()", "const cn = (...a: string[]) => a.join(' '); const e = <div className={cn('p-2', 'animate-ping')} />", ["forbidden-css-animation"]],
    ["className-похожие слова допустимы", "<div className='transitioned animated p-2' />", []],
  ],
  "файлы и пути": [
    [".tsx вне src/", "export const a = 1", ["outside-src"]],
  ],
};

for (const [group, list] of Object.entries(cases)) {
  describe(group, () => {
    for (const [name, code, expected] of list) {
      it(name, () => {
        const path = group === "файлы и пути" ? "lib/A.tsx" : "src/Scene.tsx";
        expect(rules(check(code, path))).toEqual(expected);
      });
    }
  });
}

describe("пути файлов и относительные импорты", () => {
  it.each(["lib/A.tsx", "A.tsx", "../src/A.tsx", "/abs/src/A.tsx", "src/../A.tsx", "src\\A.tsx"])("%s — вне src/", (p) => {
    expect(rules(check("export const a = 1", p))).toEqual(["outside-src"]);
  });
  it("импорт соседнего каталога внутри src/ допустим", () => {
    expect(check("import { B } from '../B'", "src/parts/A.tsx")).toEqual([]);
  });
  it("импорт, выходящий из src/ из вложенного файла", () => {
    expect(rules(check("import { B } from '../../B'", "src/parts/A.tsx"))).toEqual(["outside-src"]);
  });
  it("синтаксическая ошибка — отдельное правило", () => {
    expect(rules(check("const = 1"))).toEqual(["syntax-error"]);
  });
  it("CSS-файл: анимации, внешние url и @import", () => {
    expect(rules(check(".a { transition: all 1s }", "src/a.css"))).toEqual(["forbidden-css-animation"]);
    expect(rules(check("@keyframes x { from { opacity: 0 } }", "src/a.css"))).toEqual(["forbidden-css-animation"]);
    expect(rules(check(".a { background: url(https://x/a.png) }", "src/a.css"))).toEqual(["external-url"]);
    expect(rules(check("@import './b.css';", "src/a.css"))).toEqual(["external-url"]);
    expect(check(".a { background: url(./b.png); color: red }", "src/a.css")).toEqual([]);
  });
  it("несколько файлов проверяются вместе, локальные имена не протекают между ними", () => {
    const v = checkSceneSource([
      { path: "src/a.tsx", text: "export const fetch = (n: number) => n" },
      { path: "src/Scene.tsx", text: "fetch('/x')" },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: "forbidden-global", file: "src/Scene.tsx" });
  });
  it("файл без import/export — тоже модуль: его var не делает глобал локальным", () => {
    const v = checkSceneSource([
      { path: "src/a.ts", text: "var fetch = 1" },
      { path: "src/Scene.tsx", text: "export const x = fetch" },
    ]);
    expect(rules(v)).toEqual(["forbidden-global"]);
  });
});

describe("checkSceneDir: файлы версии на диске", () => {
  let tmp: string;
  beforeEach(async () => {
    await mkdir(REPO_TMP, { recursive: true });
    tmp = await mkdtemp(join(REPO_TMP, "ms-static-check-"));
    await mkdir(join(tmp, "src", "parts"), { recursive: true });
    await writeFile(join(tmp, "src", "Scene.tsx"), okScene);
    await writeFile(join(tmp, "src", "parts", "Title.tsx"), "export const Title = (p: { text: string; className?: string }) => <div className={p.className}>{p.text}</div>;\n");
    await writeFile(join(tmp, "src", "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(tmp, "props.json"), "{}");
  });
  afterEach(() => rm(tmp, { recursive: true, force: true }));

  it("чистая версия — без нарушений", async () => {
    expect(await checkSceneDir(tmp)).toEqual([]);
  });
  it("нарушение во вложенном файле", async () => {
    await writeFile(join(tmp, "src", "parts", "Bad.ts"), "export const t = Date.now();\n");
    const v = await checkSceneDir(tmp);
    expect(v).toEqual([expect.objectContaining({ rule: "forbidden-global", file: "src/parts/Bad.ts", line: 1 })]);
  });
  it("симлинк в src/", async () => {
    await symlink("/etc/hosts", join(tmp, "src", "hosts.ts"));
    expect(await checkSceneDir(tmp)).toEqual([expect.objectContaining({ rule: "outside-src", file: "src/hosts.ts" })]);
  });
  it("src/ — симлинк", async () => {
    await rm(join(tmp, "src"), { recursive: true });
    await mkdir(join(tmp, "real"));
    await symlink(join(tmp, "real"), join(tmp, "src"));
    expect(rules(await checkSceneDir(tmp))).toEqual(["outside-src"]);
  });
  it("нет src/", async () => {
    await rm(join(tmp, "src"), { recursive: true });
    expect(rules(await checkSceneDir(tmp))).toEqual(["outside-src"]);
  });
  it("файл без расширения или неизвестного типа", async () => {
    await writeFile(join(tmp, "src", "helper"), "fetch('/x')\n");
    await writeFile(join(tmp, "src", "x.wasm"), "\0asm");
    // .txt webpack Remotion разобрал бы как JavaScript: правила asset для него нет.
    await writeFile(join(tmp, "src", "notes.txt"), "fetch('/x')\n");
    await writeFile(join(tmp, "src", "data.json"), "{}");
    await writeFile(join(tmp, "src", "font.woff2"), "wOF2");
    const v = await checkSceneDir(tmp);
    expect(v.map((x) => [x.rule, x.file])).toEqual([
      ["forbidden-file", "src/helper"],
      ["forbidden-file", "src/notes.txt"],
      ["forbidden-file", "src/x.wasm"],
    ]);
  });
  it("CSS-файл в src/ проверяется", async () => {
    await writeFile(join(tmp, "src", "a.css"), ".a {\n  animation: spin 1s;\n}\n");
    expect(await checkSceneDir(tmp)).toEqual([expect.objectContaining({ rule: "forbidden-css-animation", file: "src/a.css", line: 2 })]);
  });
  it("фикстуры render: hello-scene чистая, net-scene ловится на fetch и внешних адресах", async () => {
    expect(await checkSceneDir(join(RENDER_FIXTURES, "hello-scene"))).toEqual([]);
    expect(rules(await checkSceneDir(join(RENDER_FIXTURES, "net-scene")))).toEqual(["forbidden-global", "external-url"]);
  });
});
