# GlowingCard — `animata/glowing-card`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Тёмно-синяя карточка 224×256 с тонкой градиентной рамкой (синий →
пурпурный → золотой) и размытым градиентным ореолом; по hover вспыхивает
неоновое свечение (`shadow-glow`, `brightness-150`).

## Когда использовать

Выделить одну фичу/тариф/карточку среди других, «звёздный» пункт. Статичная
композиция хороша сама; hover-анимацию воспроизвести по кадру.

## Фразы из озвучки

- «наш лучший тариф»
- «особенная функция»
- «то, что выделяет нас»

## Визуальный стиль

Неоновый, «AI/premium», скругление 1.5rem.

## Входные данные

`GlowCardProps` (+ атрибуты `div`): `fromColor?` (`#4158D0`), `viaColor?`
(`#C850C0`), `toColor?` (`#FFCC70`), `className?`. Заголовок «Glowing» и текст
зашиты — для видео вынести в props/children.

## Анимации

`transition-[box-shadow,filter] duration-500` по `hover:`; тень
`--shadow-glow` (три слоя rgba) и `--blur-20` из `styles/globals.css`.

## Исходники и документация

- `templates/react-libriry/animata/animata/card/glowing-card.tsx` — компонент
- `templates/react-libriry/animata/content/docs/card/glowing-card.mdx` — документация
- `templates/react-libriry/animata/animata/card/glowing-card.stories.tsx` — пример

## Зависимости

Tailwind v4 (тема animata: `shadow-glow`, `blur-20`), `@/lib/utils`.

## Совместимость и адаптация

Свечение и яркость задать inline из кадра: `filter: brightness(1 + 0.5p)`,
`boxShadow` с альфой ∝ p (пульс или вспышка в момент упоминания).

## Паттерны

`key-point-emphasis`
