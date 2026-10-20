# SparklesText — `magicui/sparkles-text`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `engine:motion`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Жирный заголовок, вокруг и поверх которого вспыхивают и гаснут
четырёхлучевые звёздочки-искры двух цветов.

## Когда использовать

Праздничный акцент: «новинка», «победитель», «идеально», итог,
благодарность. В серьёзном/корпоративном ролике — с осторожностью.

## Фразы из озвучки

- «и это просто волшебно»
- «наш новый рекорд»
- «спасибо, что были с нами»

## Визуальный стиль

`text-6xl font-bold`, искры SVG 21×21, цвета `#9E7AFF`/`#FE8BBB`;
мерцание 0.8 с, игривый.

## Входные данные

- `children: ReactNode` (обязателен)
- `sparklesCount?` = `10`
- `colors?` = `{ first: "#9E7AFF", second: "#FE8BBB" }`
- `className?`; `as?: ReactElement` объявлен в типе, но в разметке не используется.

## Анимации

Каждая искра — `motion.svg`: `opacity [0,1,0]`, `scale [0,s,0]`,
`rotate [75,120,150]`, `duration 0.8, repeat: Infinity, delay`
(случайный 0–2 с). `setInterval(100)` уменьшает `lifespan` (5–15 с) и
пересоздаёт искру в новой случайной позиции.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/sparkles-text.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/sparkles-text.mdx` — документация

## Зависимости

`motion` (`motion.svg`), `cn`.

## Совместимость и адаптация

`adaptable`. Сгенерировать N искр детерминированно (`random(seed)`:
x, y, цвет, delay, scale, lifespan); для кадра `t`: поколение
`g = floor(t/lifespan)` задаёт позицию (`random(\`${i}-${g}\`)`), фаза
`((t - delay) % 0.8)/0.8` → opacity/scale/rotate через `interpolate`.
`setInterval` и `repeat: Infinity` удалить.

## Паттерны

`key-point-emphasis`
