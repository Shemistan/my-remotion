# SvgGooeyBlob — `motion-primitives-website/svg-gooey-blob`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Несколько цветных кругов, слипающихся в «жидкие» капли (metaball через
`feGaussianBlur` + `feColorMatrix`), медленно плавают туда-обратно.

## Когда использовать

Абстрактный фон для темы слияния, объединения команд, «жидкости» данных;
декоративный элемент за заголовком.

## Фразы из озвучки

- «команды объединяются в одну»
- «идеи сливаются воедино»
- «гибкая, текучая система»

## Визуальный стиль

По умолчанию 3 круга (`#8b5cf6`, `#ec4899`, `#06b6d4`), 400×400;
`intensity` 10 — сила слипания; `sine.inOut`, 3–5 с, yoyo.

## Входные данные

`SvgGooeyBlobProps`: `blobs?: {x, y, r, color?}[]`; `intensity?` (10);
`animate?` (true); `colors?`; `width?` (400), `height?` (400);
`className?`.

## Анимации

Для круга `i` GSAP `to(cx/cy = base ± random*50, duration 3 + random*2,
repeat -1, yoyo, delay i*0.5)` — значения из `Math.random()`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/svg/animated-svg.tsx` — компонент

## Зависимости

`gsap`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: для круга `i` заранее взять `dx_i, dy_i, T_i` из
`random(\`gb-${i}-x\`)` и т.п. (remotion), позиция
`cx = x + dx_i * (0.5 - 0.5*cos(2π*(t - 0.5i)/(2T_i)))`, `t = frame/fps`
(yoyo ≈ косинус) — атрибуты в рендере. Фильтр — статичный SVG, оставить.

## Паттерны

`relationships`, `abstract-concepts`
