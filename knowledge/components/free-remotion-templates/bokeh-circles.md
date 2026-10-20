# Bokeh Loop — `free-remotion-templates/bokeh-circles`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Фон из мягких расфокусированных кругов-огней (радиальный градиент + blur
20 px + `mix-blend-mode: screen`), которые плавают и «дышат» размером;
опционально по центру — надпись.

## Когда использовать

Подложка под текст, цитату, титр; тёплое, праздничное или «уютное»
настроение. Для технологичного фона лучше loop-grid-wave или starfield.

## Фразы из озвучки

- «немного атмосферы перед главным»
- «вечер, огни, праздник»
- «давайте остановимся и подумаем»

## Визуальный стиль

Тёмно-фиолетовый фон `#1a0f1f`, персиково-кремовые огни; медленно и мягко.
Шрифт подписи — системный sans-serif, 72 px. В Root: 1920×1080, 150 кадров.

## Входные данные

`BokehCirclesProps`: `colors: string[]` (4 тёплых оттенка), `baseColor`
(`#1a0f1f`), `count: number` (24), `label?` («Background Demo»),
`labelColor?` (`#ffffff`).

## Анимации

Параметры кругов (позиция, размер 80–320 px, скорость, фаза, цвет,
opacity) — из детерминированного `seededRandom(seed)` на `Math.sin`.
Позиция: `sin/cos(frame*0.02*speed + phase)` ±8 %, пульс размера ±15 %.
Надпись: fade 10–25.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/bokeh-circles/BokehCircles.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`: всё — функция кадра, `Math.random` не используется. README
называет его «seamless loop», но фазы не привязаны к длительности — стык
150→0 не гарантирован. Много `filter: blur` — рендер тяжелее.

## Паттерны

`abstract-concepts`
