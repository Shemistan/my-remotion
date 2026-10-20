# Brush Stroke Reveal — `free-remotion-templates/brush-stroke-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Крупный заголовок «прорисовывается» несколькими горизонтальными мазками
кисти (каждая полоса текста открывается своим scaleX-вайпом), затем
появляются акцентная точка и строка описания.

## Когда использовать

Открытие ролика или раздела, слоган, ключевая фраза «от руки» на светлом
«бумажном» фоне. Для логотипа-монограммы лучше `logo-stroke-draw`, для
технологичного входа — `glitch-text`.

## Фразы из озвучки

- «и всё начинается с одной идеи»
- «наш главный принцип звучит просто»
- «запомните это слово»

## Визуальный стиль

Тёплый кремовый фон `#fffdf6`, почти чёрный текст 160px weight 900 с
разрядкой, красная точка-акцент. Шрифт: системный стек
`-apple-system, "Segoe UI", Roboto, sans-serif`. 1920×1080, 120 кадров
(4 с), 30 fps.

## Входные данные

`BrushStrokeRevealProps`: `title: string` («Brush Stroke»),
`description?: string` («painted on, stroke by stroke»), `strokes?: number`
(3), `direction?: "left" | "right"` ("left"), `textColor?` (`#1a1a1a`),
`background?` (`#fffdf6`), `accentColor?` (`#a93226`).

## Анимации

Внутренний атом `BrushReveal`: N копий текста, каждая обрезана `clipPath:
inset()` до своей полосы; `scaleX` 0→1 через `interpolate` (28 кадров,
`Easing.out(Easing.ease)`), stagger 3 кадра между полосами. Описание —
opacity 44→64 кадр, точка — 54→72.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/brush-stroke-reveal/BrushStrokeReveal.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion` (`AbsoluteFill`, `Easing`, `interpolate`, `useCurrentFrame`), `react`.

## Совместимость и адаптация

`native`: всё — функция от `useCurrentFrame`. Адаптации не нужны. Текст
дублируется по числу полос — при большом `strokes` растёт DOM.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
