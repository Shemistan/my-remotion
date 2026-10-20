# AnimatedGridPattern — `magicui/animated-grid-pattern`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Клеточная сетка, в которой случайные клетки плавно заливаются цветом и
гаснут, затем вспыхивают в другом месте — «дышащая» сетка.

## Когда использовать

Hero-фон для технологичного продукта, «система обрабатывает запросы»,
спокойная активность. Для статичной сетки — `grid-pattern`, для
быстрого мерцания — `flickering-grid`.

## Фразы из озвучки

- «платформа обрабатывает тысячи запросов»
- «всё работает в фоне, незаметно для вас»
- «каждая клетка — это задача»

## Визуальный стиль

Серые линии и заливка `gray-400/30`, клетка 40 px, 50 клеток,
затухание 4 с; медленный, спокойный ритм.

## Входные данные

- `width?` = `40`, `height?` = `40`, `x?` = `-1`, `y?` = `-1`
- `strokeDasharray?` = `0`, `numSquares?` = `50`, `maxOpacity?` = `0.5`
- `duration?` = `4` (с), `repeatDelay?` = `0.5` (с)
- `className?`, атрибуты `svg`.

## Анимации

`motion.rect`: `opacity 0 → maxOpacity`, `repeat: 1, repeatType:
"reverse"`, `delay = index·0.1`; по `onAnimationComplete` клетка
получает новую случайную позицию (`Math.random`) и `iteration+1`.
Размер — `ResizeObserver`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/animated-grid-pattern.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/animated-grid-pattern.mdx` — документация

## Зависимости

`motion` (`motion.rect`), `cn`.

## Совместимость и адаптация

`adaptable`. Размер из `useVideoConfig()`. Цикл клетки `i`: `T = 2·
duration + repeatDelay`, `local = t - 0.1·i`, поколение `g =
floor(local/T)`, позиция `random(\`${i}-${g}\`)`, opacity — подъём до
`maxOpacity` за `duration`, пауза, спад. `motion.rect` → `rect`.

## Паттерны

`abstract-concepts`, `system-structure`
