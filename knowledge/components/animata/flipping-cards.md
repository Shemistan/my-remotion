# FlippingCards — `animata/flipping-cards`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Сетка 3 колонки (2 на мобильных) из карточек 192×240, каждая из которых
при наведении переворачивается по оси Y и показывает обратную сторону.

## Когда использовать

«Вопрос → ответ», «миф → факт», «до → после» для нескольких пунктов;
раскрытие карточек по очереди.

## Фразы из озвучки

- «перевернём каждую карточку»
- «миф или правда?»
- «за каждым пунктом — конкретный результат»

## Визуальный стиль

Плоские карточки без скругления (`[&>div]:rounded-none`), gap-5,
3D-переворот 500 мс ease-out; лицевые стороны задаёт пользователь.

## Входные данные

Composable API: `FlippingCards` (div-grid, `className`) →
`FlippingCards.Item` (= `FlipCard` с `rotate="y"`, props `ComponentProps<
typeof FlipCard>`) → `Item.Front` / `Item.Back`. Хелпер
`getFlippingCardsAccent(index)` возвращает `hsl(var(--accent))`.

## Анимации

В `FlipCard` (срез card): `group-hover/card:rotate-y-180`,
`transition-transform duration-500 ease-out`, `transform-3d`,
`backface-hidden`, `perspective-[1000px]`.

## Исходники и документация

- `templates/react-libriry/animata/animata/list/flipping-cards.tsx` — сетка
- `templates/react-libriry/animata/animata/card/flip-card.tsx` — механика переворота
- `templates/react-libriry/animata/content/docs/list/flipping-cards.mdx` — документация
- `templates/react-libriry/animata/animata/list/flipping-cards.stories.tsx` — пример

## Зависимости

`animata/card/flip-card`, `@/lib/utils`, Tailwind v4 3D-утилиты.

## Совместимость и адаптация

`adaptable`: убрать hover-класс, на внутренний слой карточки `i` повесить
inline `transform: rotateY(${180*p_i}deg)`, где `p_i =
interpolate(frame - start - i*stagger, [0, 15], [0, 1], clamp)`; перспектива
и backface остаются.

## Паттерны

`transformation`, `sequence-steps`, `comparison`
