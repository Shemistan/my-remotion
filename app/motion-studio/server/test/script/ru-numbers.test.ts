// S3: русские числительные словами (Р21) — для сверки `data.value` с цитатой без цифр.
import { describe, expect, it } from "vitest";
import { ruNumberValues } from "../../src/script/ru-numbers.js";

describe("ruNumberValues", () => {
  it("фразы из текстов человека", () => {
    expect(ruNumberValues("один к двумстам пятидесяти шести")).toEqual([1, 256]);
    expect(ruNumberValues("шесть с половиной записей")).toEqual([6.5]);
    expect(ruNumberValues("восемь слотов")).toEqual([8]);
    expect(ruNumberValues("две тысячи двадцать пятого")).toEqual([2025]);
    expect(ruNumberValues("пара бакетов")).toEqual([]);
  });

  it("падежи, ё, тысяча без множителя, ноль", () => {
    expect(ruNumberValues("около четырёх процентов CPU")).toEqual([4]);
    expect(ruNumberValues("тысяча записей")).toEqual([1000]);
    expect(ruNumberValues("с тремястами сорока двумя ключами")).toEqual([342]);
    expect(ruNumberValues("ноль аллокаций")).toEqual([0]);
    expect(ruNumberValues("девяносто девять и сто")).toEqual([99, 100]);
    expect(ruNumberValues("одиннадцати бакетам")).toEqual([11]);
  });

  it("числа подряд без связки — разные числа, если разряд не убывает", () => {
    expect(ruNumberValues("два три")).toEqual([2, 3]);
    expect(ruNumberValues("двадцать тридцать")).toEqual([20, 30]);
    expect(ruNumberValues("Go 1.24")).toEqual([]);
  });
});
