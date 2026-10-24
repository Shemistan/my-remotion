// S8: выделение текста → id слов (`selectionToWords`) и DOM-выделение → смещения в блоке.
import { tokenizeScript } from "@ms/contracts";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { domSelectionRange, selectionToWords } from "../../src/script/selection.js";

const { blocks, words } = tokenizeScript([
  { title: "", text: "В Go 1.24 — Swiss Table." },
  { title: "", text: "Второй блок текста." },
]);
const doc = { schema_version: 1 as const, script_id: "s", revision: 1, blocks, words, author: "user" as const };

it("слова, пересекающиеся с выделением; только пробел/тире — null", () => {
  expect(selectionToWords(doc, "b1", 5, 9)).toEqual({ start_word_id: "w_000003", end_word_id: "w_000003" }); // «1.24»
  expect(selectionToWords(doc, "b1", 3, 12)).toEqual({ start_word_id: "w_000002", end_word_id: "w_000003" }); // «o 1.24 — » (конец не включён)
  expect(selectionToWords(doc, "b1", 9, 10)).toBeNull();
  expect(selectionToWords(doc, "b1", 12, 12)).toBeNull(); // пустое выделение
  expect(selectionToWords(doc, "b2", 0, 6)).toEqual({ start_word_id: "w_000006", end_word_id: "w_000006" });
  expect(selectionToWords(doc, "b9", 0, 6)).toBeNull();
});

it("DOM-выделение: смещения символов в блоке; через границу блоков — cross_block", () => {
  const { container } = render(
    <div>
      <p data-block-id="b1"><span>В Go </span><mark data-n="1">1.24 — Swiss</mark><span> Table.</span></p>
      <p data-block-id="b2"><span>Второй блок текста.</span></p>
    </div>,
  );
  const [p1, p2] = container.querySelectorAll("p");
  const sel = window.getSelection()!;
  const r = document.createRange();
  r.setStart(p1!.childNodes[1]!.firstChild!, 0);
  r.setEnd(p1!.childNodes[2]!.firstChild!, 3);
  sel.removeAllRanges();
  sel.addRange(r);
  expect(domSelectionRange(container, sel)).toEqual({ blockId: "b1", start: 5, end: 20 });

  const r2 = document.createRange();
  r2.setStart(p1!.childNodes[2]!.firstChild!, 1);
  r2.setEnd(p2!.firstChild!.firstChild!, 3);
  sel.removeAllRanges();
  sel.addRange(r2);
  expect(domSelectionRange(container, sel)).toBe("cross_block");

  sel.removeAllRanges();
  expect(domSelectionRange(container, sel)).toBeNull();
});
