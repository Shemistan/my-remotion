# GlowingBorder — `motion-primitives-website/glowing-border`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Карточка с градиентной рамкой и мягким внешним свечением, которое
пульсирует («дышит»).

## Когда использовать

Акцент на ключевой карточке/цифре, «живой» статус, выбранный вариант.

## Фразы из озвучки

- «вот главный показатель»
- «этот модуль сейчас активен»
- «мы рекомендуем именно его»

## Визуальный стиль

`rounded-xl p-px`; рамка `linear-gradient(135deg, color, transparent,
color)` opacity 0.5; тень `0 0 20→30px color33→55, 0 0 40→60px`.
Цвет по умолчанию `hsl(var(--primary))` — суффиксы альфы `33/55` к
`hsl(...)` дают невалидный CSS: передавать hex (`#8b5cf6`).

## Входные данные

`GlowingBorderProps`: `children`; `color?`; `animationDuration?` (2, с);
`className?`.

## Анимации

motion `boxShadow` по трём ключам, `easeInOut`, бесконечно.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/border-beam.tsx` — компонент

## Зависимости

`framer-motion`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `k = 0.5 - 0.5*cos(2π*frame/(animationDuration*fps))`;
`boxShadow: 0 0 ${20+10k}px ${color}${hexAlpha(0.2+0.13k)}, 0 0 ${40+20k}px …`
на обычном `div`; цвет — hex.

## Паттерны

`key-point-emphasis`
