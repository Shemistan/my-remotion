# LightRays — `magicui/light-rays`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Мягкие размытые лучи света, падающие сверху веером и медленно
покачивающиеся, с двумя радиальными «засветками» в верхних углах.

## Когда использовать

Атмосферный фон для заставки, «озарение», «свет в конце тоннеля»,
торжественный момент, премиальный продукт.

## Фразы из озвучки

- «и тут нас осенило»
- «момент истины»
- «свет в конце тоннеля»

## Визуальный стиль

Голубоватый свет `rgba(160, 210, 255, 0.2)`, blur 36 px,
`mix-blend-screen`; очень медленно (цикл 14 с).

## Входные данные

- `count?` = `7`, `color?` = `"rgba(160, 210, 255, 0.2)"`
- `blur?` = `36` (px), `speed?` = `14` (с, длительность цикла)
- `length?` = `"70vh"`, `className?`, `style?`, `ref?`, атрибуты `div`.

## Анимации

Лучи создаются в `useEffect` с `Math.random()` (left 8–92 %, rotate
±28°, width 160–320 px, swing, delay, duration 0.75–1.25 цикла,
intensity); каждый — `motion.div` `opacity [0, intensity, 0]`, `rotate
[r-s, r+s, r-s]`, `repeat: Infinity, repeatDelay: duration·0.1`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/light-rays.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/light-rays.mdx` — документация

## Зависимости

`motion`, Tailwind v4 (`color-mix`, `mix-blend-screen`), `cn`.

## Совместимость и адаптация

`adaptable`. `createRays` перевести на `random(\`ray-${i}-…\`)` и
считать синхронно (не в `useEffect` — иначе первый кадр пуст). Фаза
луча `p = ((t - delay) % (1.1·duration)) / duration` → opacity и
rotate через `interpolate([0, .5, 1], …)`; `motion.div` → `div`.
`length` в `vh` → px композиции.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
