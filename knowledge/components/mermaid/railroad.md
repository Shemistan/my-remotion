# Railroad / syntax diagram (beta) — `mermaid/railroad`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type, beta (v11.16.0+); варианты EBNF/ABNF/PEG/IR |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Синтаксическая диаграмма грамматики: «рельсы», терминалы в скруглённых
рамках, нетерминалы в прямоугольниках, развилки альтернатив и петли
повторений.

## Когда использовать

Объяснить синтаксис языка, формата или команды (как на json.org). Все
четыре нотации дают одинаковую картинку, поэтому это одна запись.

## Фразы из озвучки

- «цифра — это любой символ от нуля до девяти»
- «число состоит из одной или нескольких цифр»
- «здесь грамматика разветвляется на два варианта»

## Визуальный стиль

Тонкие линии-рельсы с плавными поворотами, рамки токенов. Учебный,
технический.

## Входные данные

Текстовый DSL (`docs/syntax/railroad.md`):

```
railroad-ebnf-beta
title "Digit Definition"

digit = "0" | "1" | "2" | "3" ;
```

Варианты ключевого слова: `railroad-ebnf-beta` (EBNF, стили W3C и ISO
14977), `railroad-abnf-beta` (RFC 5234), `railroad-peg-beta` (PEG),
`railroad-beta` (IR-конструкторы). Каждое правило заканчивается `;`.

## Анимации

Своей анимации нет. По кадру «поезд» проходит по рельсам:
`stroke-dashoffset` по пути слева направо.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/railroad/railroadDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/railroad/ebnfDetector.ts` (+ abnf/peg детекторы)
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/railroad/railroadDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/railroad/railroadRenderer.ts`
- `templates/infografika/mermaid/docs/syntax/railroad.md`, `templates/infografika/mermaid/demos/railroad.html`

## Зависимости

`mermaid` 12.2.0, `d3`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: четыре
детектора, один `railroadRenderer.ts`; правила идут сверху вниз в порядке
DSL. Классы терминалов и нетерминалов сверить по готовому SVG.

## Паттерны

`sequence-steps`, `system-structure`
