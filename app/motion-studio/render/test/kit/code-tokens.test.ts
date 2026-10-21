// tokenizeCode: простой лексер без зависимостей; typedTokens — набор по токенам.
import { describe, expect, it } from "vitest";
import { tokenizeCode, typedTokens } from "../../src/motion-kit/code-tokens.js";

const kinds = (src: string, lang: "ts" | "py" | "json" | "bash") => tokenizeCode(src, lang).map((t) => t.kind);
const pairs = (src: string, lang: "ts" | "py" | "json" | "bash") => tokenizeCode(src, lang).filter((t) => t.kind !== "ws").map((t) => `${t.kind}:${t.text}`);

describe("tokenizeCode", () => {
  it("ts: ключевые слова, числа, знаки, комментарий", () => {
    expect(kinds("const x = 42; // hi", "ts")).toEqual(["kw", "ws", "id", "ws", "punct", "ws", "num", "punct", "ws", "com"]);
  });
  it("склейка токенов даёт исходный текст байт в байт", () => {
    const src = 'export async function load(id: string) {\n  const r = await fetch(`/api/${id}`, { method: "GET" });\n  /* 2 попытки */ return r.json() ?? 0x1F;\n}\n';
    expect(tokenizeCode(src, "ts").map((t) => t.text).join("")).toBe(src);
  });
  it("ts: строки трёх видов, блочный комментарий, hex и дробные числа", () => {
    expect(pairs("let s = 'a\\'b' + \"c\" + `d`; /* x */ 1.5e3 0x1F", "ts")).toEqual([
      "kw:let", "id:s", "punct:=", "str:'a\\'b'", "punct:+", 'str:"c"', "punct:+", "str:`d`", "punct:;", "com:/* x */", "num:1.5e3", "num:0x1F",
    ]);
  });
  it("перевод строки — отдельный токен ws", () => {
    expect(tokenizeCode("a\n  b", "ts").map((t) => t.text)).toEqual(["a", "\n", "  ", "b"]);
  });
  it("py: комментарий #, тройные кавычки, ключевые слова", () => {
    expect(pairs('def f(x):\n    return """doc""" # c', "py")).toEqual(["kw:def", "id:f", "punct:(", "id:x", "punct:)", "punct::", "kw:return", 'str:"""doc"""', "com:# c"]);
  });
  it("json: ключи и строки — str, true/null — kw, числа со знаком", () => {
    expect(pairs('{"a": -1.5, "b": [true, null]}', "json")).toEqual(["punct:{", 'str:"a"', "punct::", "num:-1.5", "punct:,", 'str:"b"', "punct::", "punct:[", "kw:true", "punct:,", "kw:null", "punct:]", "punct:}"]);
  });
  it("bash: команда, флаги, переменная, комментарий", () => {
    expect(pairs('if [ -f "$F" ]; then echo $HOME; fi # ok', "bash")).toEqual([
      "kw:if", "punct:[", "id:-f", 'str:"$F"', "punct:]", "punct:;", "kw:then", "id:echo", "id:$HOME", "punct:;", "kw:fi", "com:# ok",
    ]);
  });
  it("незакрытая строка и комментарий — до конца строки/текста, без исключения", () => {
    expect(tokenizeCode('x = "abc\ny', "ts").map((t) => t.text).join("")).toBe('x = "abc\ny');
    expect(kinds("/* open", "ts")).toEqual(["com"]);
  });
});

describe("typedTokens", () => {
  it("по токенам, не по буквам", () => {
    expect(typedTokens(tokenizeCode("a b", "ts"), 0.34).map((t) => t.text).join("")).toBe("a");
  });
  it("0 — ничего, 1 — весь текст; токены не режутся", () => {
    const toks = tokenizeCode('const greeting = "Привет, мир";', "ts");
    expect(typedTokens(toks, 0)).toEqual([]);
    expect(typedTokens(toks, 1).map((t) => t.text).join("")).toBe('const greeting = "Привет, мир";');
    for (let p = 0; p <= 1; p += 0.05) {
      for (const t of typedTokens(toks, p)) expect(toks).toContain(t);
    }
  });
  it("набор монотонен: при большем p — префикс не короче", () => {
    const toks = tokenizeCode("function add(a: number, b: number) {\n  return a + b;\n}", "ts");
    let prev = 0;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const n = typedTokens(toks, p).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(prev).toBe(toks.length);
  });
});
