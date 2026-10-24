// S3: русские числительные словами (Р21) — для сверки `data.value` с цитатой без цифр.
import { describe, expect, it } from "vitest";
import { ruNumberValues } from "../../src/script/ru-numbers.js";
import { valueMatches, wordNumberMatches } from "../../src/script/plan-validate.js";

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

  it("десятичные дроби словами: «N и M десятых/сотых/тысячных», «N целых M десятых»", () => {
    // фраза из tmp/script-mvp/block-2.txt
    expect(ruNumberValues("Если в чужих видео встретите «шесть и две десятых» — в моих источниках такого числа нет")).toEqual([6.2]);
    expect(ruNumberValues("три целых четырнадцать сотых")).toEqual([3.14]);
    expect(ruNumberValues("ноль и пять тысячных")).toEqual([0.005]);
    expect(ruNumberValues("две десятых")).toEqual([0.2]);
    expect(ruNumberValues("одна десятая секунды")).toEqual([0.1]);
    expect(ruNumberValues("восемь и девять")).toEqual([8, 9]);
  });

  it("миллион, миллиард, полтора — множители и значения", () => {
    expect(ruNumberValues("два миллиона ключей")).toEqual([2_000_000]);
    expect(ruNumberValues("полторы тысячи записей")).toEqual([1500]);
    expect(ruNumberValues("полтора миллиона")).toEqual([1_500_000]);
    expect(ruNumberValues("в полтора раза")).toEqual([1.5]);
    expect(ruNumberValues("миллиард операций")).toEqual([1e9]);
    expect(ruNumberValues("три миллиарда двести миллионов")).toEqual([3.2e9]);
    expect(ruNumberValues("один миллион триста тысяч")).toEqual([1_300_000]);
  });

  it("неточные количества и доли не выдаются числом: «десятки тысяч», «тысячи», «треть», «четверть», «половина»", () => {
    expect(ruNumberValues("десятки тысяч ключей")).toEqual([]);
    expect(ruNumberValues("сотни бакетов")).toEqual([]);
    expect(ruNumberValues("тысячи записей")).toEqual([]);
    expect(ruNumberValues("несколько миллионов")).toEqual([]);
    expect(ruNumberValues("треть памяти")).toEqual([]);
    expect(ruNumberValues("четверть слотов")).toEqual([]);
    expect(ruNumberValues("половина бакетов")).toEqual([]);
  });
});

describe("сверка value с числами словами (Р21)", () => {
  it("неточное количество или доля — не проверить (undefined), а не отказ", () => {
    expect(wordNumberMatches(10_000, "десятки тысяч ключей")).toBeUndefined();
    expect(wordNumberMatches(1000, "тысячи записей")).toBeUndefined();
    expect(wordNumberMatches(1 / 3, "треть памяти")).toBeUndefined();
    expect(wordNumberMatches(0.25, "четверть слотов")).toBeUndefined();
    expect(wordNumberMatches(0.5, "половина бакетов")).toBeUndefined();
    expect(wordNumberMatches(3, "пара бакетов")).toBeUndefined();
  });

  it("однозначное — сверяется; рядом с неточным: совпало — true, иначе undefined", () => {
    expect(wordNumberMatches(6.2, "шесть и две десятых")).toBe(true);
    expect(wordNumberMatches(6.5, "шесть и две десятых")).toBe(false);
    expect(wordNumberMatches(2e6, "два миллиона ключей")).toBe(true);
    expect(wordNumberMatches(2, "два миллиона ключей")).toBe(false);
    expect(wordNumberMatches(1500, "полторы тысячи")).toBe(true);
    expect(wordNumberMatches(8, "восемь слотов и десятки тысяч ключей")).toBe(true);
    expect(wordNumberMatches(9, "восемь слотов и десятки тысяч ключей")).toBeUndefined();
  });

  it("цифры не совпали — запасная сверка словами; отказ, только если и она не true", () => {
    // «2 в степени n минус четыре»: цифра 2 есть, value 4 сказано словом
    expect(valueMatches(4, "2 в степени n минус четыре")).toBe(true);
    expect(valueMatches(5, "2 в степени n минус четыре")).toBe(false);
    expect(valueMatches(5, "2 бакета и десятки тысяч ключей")).toBe(false);
    expect(valueMatches(1.24, "Go 1.24")).toBe(true);
    expect(valueMatches(1.25, "Go 1.24")).toBe(false);
  });
});
