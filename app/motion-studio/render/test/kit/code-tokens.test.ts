// tokenizeCode: простой лексер без зависимостей; typedTokens — набор по токенам.
import { describe, expect, it } from "vitest";
import { caretLine, codeLines, tokenizeCode, typedTokens } from "../../src/motion-kit/code-tokens.js";

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

describe("codeLines / caretLine: многострочные токены", () => {
  const PY = 'def total(xs):\n    """Сумма списка.\n\n    Пустой список — 0.\n    """\n    return sum(xs)';
  const JSDOC = "/**\n * Сумма двух чисел.\n * @param a первое\n */\nfunction add(a: number, b: number) {\n  return a + b;\n}";

  it("py docstring: строк столько же, сколько в тексте; фрагменты docstring — один idx", () => {
    const toks = tokenizeCode(PY, "py");
    const lines = codeLines(toks);
    expect(lines.length).toBe(PY.split("\n").length);
    expect(lines.map((l) => l.map((f) => f.text).join(""))).toEqual(PY.split("\n"));
    const doc = toks.findIndex((t) => t.text.startsWith('"""'));
    const rows = lines.map((l, i) => (l.some((f) => f.idx === doc) ? i : -1)).filter((i) => i >= 0);
    expect(rows).toEqual([1, 2, 3, 4]);
    for (const l of lines) for (const f of l) expect(f.text).not.toContain("\n");
  });

  it("JSDoc: блочный комментарий занимает свои 4 строки, код — следующие", () => {
    const toks = tokenizeCode(JSDOC, "ts");
    const lines = codeLines(toks);
    expect(lines.length).toBe(7);
    expect(lines[0]!.map((f) => f.kind)).toEqual(["com"]);
    expect(lines[3]!.map((f) => f.text).join("")).toBe(" */");
    expect(lines[4]![0]).toMatchObject({ text: "function", kind: "kw" });
  });

  it("caretLine считает переводы строк и внутри токенов", () => {
    const toks = tokenizeCode(JSDOC, "ts");
    expect(caretLine(toks, 0)).toBe(0);
    expect(caretLine(toks, 1)).toBe(3); // весь JSDoc набран — каретка в его последней строке
    expect(caretLine(toks, 2)).toBe(4); // перевод строки после него
    expect(caretLine(toks, toks.length)).toBe(6);
    const py = tokenizeCode(PY, "py");
    const doc = py.findIndex((t) => t.text.startsWith('"""'));
    expect(caretLine(py, doc + 1)).toBe(4);
  });
});
