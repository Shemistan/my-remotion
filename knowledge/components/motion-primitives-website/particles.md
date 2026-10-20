# Particles — `motion-primitives-website/particles`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Полноэкранный canvas с медленно дрейфующими точками; с `connected` —
близкие точки соединяются тонкими линиями (эффект «сеть/созвездие»).

## Когда использовать

Фон для тем «сеть», «связи», «данные», «сообщество», «нейросеть»;
плексус-фон за заголовком.

## Фразы из озвучки

- «всё связано между собой»
- «сеть из тысяч участников»
- «данные образуют связи»

## Визуальный стиль

Точки радиусом 1–3 px цвета `color` (opacity 0.6), линии 0.5 px с
прозрачностью по расстоянию; оборачивание на краях.

## Входные данные

`ParticlesProps`: `quantity?` (50); `color?` (`'#ffffff'`); `size?` (2);
`speed?` (0.5); `connected?` (false); `connectionDistance?` (100);
`className?`.

## Анимации

`requestAnimationFrame`: `x += vx`, `y += vy` (накопление), wrap по
краям; начальные позиции и скорости — `Math.random()`; размер —
`window.innerWidth/innerHeight`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/particles.tsx` — компонент (+ `Sparkles`)
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Particles»

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: интегрирующий цикл на rAF в Canvas. Переработка: начальные
`x0, y0, vx, vy, size` — `random(\`p-${i}-…\`)`; позиция — замкнутая
формула `x = mod(x0 + vx*frame*(60/fps), W)` (без накопления); рисовать
в `useEffect([frame])` или проще — SVG-кружки и линии прямо в JSX;
размер — `useVideoConfig()` вместо `window`.

## Паттерны

`relationships`, `system-structure`, `abstract-concepts`
