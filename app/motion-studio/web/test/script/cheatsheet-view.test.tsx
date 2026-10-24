// S9: шпаргалка пакета — .md показывается таблицей по блокам (разметка не исполняется как
// HTML), .csv и .txt — ссылки на скачивание; разбор markdown — чистая функция.
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CheatsheetView } from "../../src/components/script/CheatsheetView.js";
import { t } from "../../src/i18n/index.js";
import { parseCheatsheet } from "../../src/script/output.js";
import { renderQ } from "../helpers.js";

afterEach(() => vi.unstubAllGlobals());

const MD = [
  "# Шпаргалка: Go map, 16:9",
  "",
  "## Swiss Table",
  "",
  "| № | файл (фон) | файл (альфа) | ≈ время в блоке | фраза |",
  "|---|---|---|---:|---|",
  "| 01 | 01_v-go.mp4 | 01_v-go_alpha.mov | 0:00 | «В Go 1.24 \\| Swiss Table» |",
  "| 02 | 02_tablica.mp4 | 02_tablica_alpha.mov | 0:02 | «Таблица делится…» |",
  "",
  "## Поиск",
  "",
  "| № | файл (фон) | файл (альфа) | ≈ время в блоке | фраза |",
  "|---|---|---|---|---|",
  "| 03 | — | — | 0:00 | «Поиск сначала…» <b>x</b> |",
  "",
  "Сцены без файла: 1.",
].join("\n");

it("parseCheatsheet: заголовки, таблицы (без строки-разделителя, с экранированной |), абзацы", () => {
  const parts = parseCheatsheet(MD);
  expect(parts.map((p) => p.kind)).toEqual(["heading", "heading", "table", "heading", "table", "text"]);
  const table = parts[2]!;
  if (table.kind !== "table") throw new Error("ожидалась таблица");
  expect(table.head).toEqual(["№", "файл (фон)", "файл (альфа)", "≈ время в блоке", "фраза"]);
  expect(table.rows).toEqual([
    ["01", "01_v-go.mp4", "01_v-go_alpha.mov", "0:00", "«В Go 1.24 | Swiss Table»"],
    ["02", "02_tablica.mp4", "02_tablica_alpha.mov", "0:02", "«Таблица делится…»"],
  ]);
  expect(parts[0]).toEqual({ kind: "heading", level: 1, text: "Шпаргалка: Go map, 16:9" });
  expect(parseCheatsheet("")).toEqual([]);
});

it("md → таблицы по блокам; HTML из текста не исполняется; CSV и TXT — ссылки", async () => {
  const fetchMock = vi.fn(async () => new Response(MD, { status: 200, headers: { "content-type": "text/markdown; charset=utf-8" } }));
  vi.stubGlobal("fetch", fetchMock);
  renderQ(<CheatsheetView packageId="pkg_1" />);
  const tables = await screen.findAllByRole("table");
  expect(tables).toHaveLength(2);
  expect(within(tables[0]!).getAllByRole("columnheader").map((x) => x.textContent)).toEqual(["№", "файл (фон)", "файл (альфа)", "≈ время в блоке", "фраза"]);
  expect(within(tables[0]!).getAllByRole("row")).toHaveLength(3);
  expect(screen.getByRole("heading", { name: "Swiss Table" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Поиск" })).toBeTruthy();
  expect(tables[1]!.querySelector("b")).toBeNull();
  expect(tables[1]!.textContent).toContain("<b>x</b>");
  expect(fetchMock).toHaveBeenCalledWith("/api/script-packages/pkg_1/cheatsheet?format=md", expect.anything());
  expect(screen.getByRole("link", { name: t("scriptOutput.cheatsheet.csv") }).getAttribute("href")).toBe("/api/script-packages/pkg_1/cheatsheet?format=csv");
  expect(screen.getByRole("link", { name: t("scriptOutput.cheatsheet.txt") }).getAttribute("href")).toBe("/api/script-packages/pkg_1/cheatsheet?format=txt");
  expect(screen.getByRole("link", { name: t("scriptOutput.cheatsheet.md") }).getAttribute("href")).toBe("/api/script-packages/pkg_1/cheatsheet?format=md");
});

it("шпаргалка недоступна — понятный текст, ссылки остаются", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "not_found", message: "нет" }), { status: 404 })));
  renderQ(<CheatsheetView packageId="pkg_1" />);
  await waitFor(() => expect(screen.getByText(t("scriptOutput.cheatsheet.unavailable"))).toBeTruthy());
  expect(screen.getByRole("link", { name: t("scriptOutput.cheatsheet.txt") })).toBeTruthy();
});
