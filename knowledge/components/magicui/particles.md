# Particles — `magicui/particles`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `user-events`, `dom`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Поле мелких светящихся точек-пылинок, медленно дрейфующих и мягко
тянущихся к курсору; у краёв плавно гаснут.

## Когда использовать

Атмосферный фон для hero, космоса, «магии», спокойных пауз.
Для падающих метеоров — `meteors`, для 3D-облака — `floating-3d-particles`.

## Фразы из озвучки

- «в воздухе витает что-то новое»
- «тысячи маленьких деталей»
- «спокойствие и концентрация»

## Визуальный стиль

Белые точки (`#ffffff`) размером 0.4–2.4 px, alpha 0.1–0.7, дрейф
±0.05 px/кадр; очень спокойно, на тёмном фоне.

## Входные данные

- `quantity?` = `100`, `staticity?` = `50`, `ease?` = `50`
- `size?` = `0.4`, `refresh?` = `false`, `color?` = `"#ffffff"` (hex)
- `vx?` = `0`, `vy?` = `0` (общий снос), `className?`, атрибуты `div`.

## Анимации

Canvas 2D; `requestAnimationFrame` мутирует частицы: `x += dx + vx`,
alpha нарастает на 0.02 за тик до `targetAlpha` и гасится у краёв
(20 px); смещение к мыши `translate += (mouse/(staticity/magnetism) -
translate)/ease`; вылетевшие пересоздаются `Math.random()`. Resize — с
`setTimeout(200)`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/particles.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/particles.mdx` — документация

## Зависимости

React, `cn`.

## Совместимость и адаптация

`complex`: интегрируемое во времени состояние + мышь. Переписать как
функцию кадра: параметры частицы из `random(\`p-${i}\`)`, позиция
`x0 + (dx+vx)·frame` с переносом по модулю ширины (вместо
пересоздания), alpha = `min(target, 0.02·frame)·edgeFade`; мышь убрать
или заменить заданной траекторией. Рисовать в `useEffect([frame])`.

## Паттерны

`abstract-concepts`
