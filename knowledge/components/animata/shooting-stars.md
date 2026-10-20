# ShootingStars — `animata/shooting-stars`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `css-animation`, `svg`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Ночное небо: мерцающие точки-звёзды и падающие звёзды — светлые
сужающиеся штрихи с ярким «головным» свечением, летящие по диагонали вниз
вправо; после пролёта звезда перерождается с новыми параметрами.

## Когда использовать

Тёмный hero, «мечта, цель, запуск», итоговые титры. Если нужна
равномерная сетка штрихов — `animata/animated-beam`.

## Фразы из озвучки

- «загадайте желание»
- «звёзды сошлись»
- «всё началось с одной идеи ночью»

## Визуальный стиль

Градиент indigo-950 → `#05050f`, SVG-градиенты white/blue/warm (82% белых),
длина штриха 60–200px, полёт 1.3–3.6 с; спокойно и кинематографично.

## Входные данные

`children?`, `className?`. Число точек 24–90 и звёзд 12–30 вычисляется из
размера контейнера.

## Анимации

CSS `@keyframes ss-shoot` (translate до `--dx/--dy`, opacity) и `ss-twinkle`
из локального `shooting-stars.css`; перерождение по `onAnimationEnd`;
параметры из `Math.random`; размер — `requestAnimationFrame` +
`getBoundingClientRect` + `ResizeObserver`.

## Исходники и документация

- `templates/react-libriry/animata/animata/background/shooting-stars.tsx` — компонент
- `templates/react-libriry/animata/animata/background/shooting-stars.css` — keyframes
- `templates/react-libriry/animata/content/docs/background/shooting-stars.mdx` — документация
- `templates/react-libriry/animata/animata/background/shooting-stars.stories.tsx` — пример

## Зависимости

React, `@/lib/utils` (`cn`).

## Совместимость и адаптация

`complex`: состояние меняется по событиям анимации и случайно. Переписать:
размер — из `useVideoConfig`, звёзды — массив из `random(seed)`, для звезды
`i` цикл `t = (frame/fps - delay_i) mod (duration_i + pause)` → translate и
opacity через `interpolate`; новые параметры на каждом цикле —
`random(seed + i + cycle)`. SVG-разметку и градиенты взять как есть.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
