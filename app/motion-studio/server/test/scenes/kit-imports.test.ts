// Компоненты kit в JSX кода сцены (S15a; ревью S15a, M-6): именованный и namespace-импорт.
import { describe, expect, it } from "vitest";
import { kitImports, kitJsxUsed } from "../../src/scenes/kit-imports.js";

describe("kitJsxUsed", () => {
  it("именованный импорт и тег, в том числе под псевдонимом; импорт без тега — нет", () => {
    const src = `import { Timeline, AnimatedNumber as N, KineticText } from "@ms/motion-kit";\nvoid KineticText;\nexport const S = () => <><Timeline items={[]} /><N value={3} /></>;`;
    expect(kitJsxUsed(src).sort()).toEqual(["AnimatedNumber", "Timeline"]);
  });

  it("namespace-импорт: `<K.Timeline>` — Timeline; хуки и токены (`K.useStyle`) — нет", () => {
    const src = `import * as K from "@ms/motion-kit";\nexport const S = () => { const s = K.useStyle(); return <K.Timeline items={[]} />; };`;
    expect(kitJsxUsed(src)).toEqual(["Timeline"]);
  });

  it("namespace без тега — пусто; kitImports namespace не считает (как раньше)", () => {
    const src = `import * as K from "@ms/motion-kit";\nvoid K.Timeline;`;
    expect(kitJsxUsed(src)).toEqual([]);
    expect(kitImports(src)).toEqual([]);
  });
});
