# ChromaGrid — `react-bits/chroma-grid`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `user-events`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Сетка фото-карточек в оттенках серого; круглое «пятно-прожектор»
возвращает цвет снимкам и подсвечивает рамки карточек акцентным цветом.
Подписи (заголовок + подзаголовок) под фото.

## Когда использовать

Портфолио, команда, витрина кейсов, «посмотрим поближе на каждый проект»,
когда нужно акцентировать одну карточку в сетке. Без прожектора — просто
спокойная монохромная сетка.

## Фразы из озвучки

- «Вот проекты, которыми мы гордимся»
- «Присмотримся к этому кейсу»
- «Наша команда — люди за продуктом»

## Визуальный стиль

Монохром + цветной прожектор радиусом 260 px с мягкой границей, акцент
карточки (`accent`), 3 колонки, соотношение 3/2, радиус 22; дорогой,
«галерейный» вид.

## Входные данные

`items` (`{image, title, subtitle, accent|borderColor, alt, url}`; по
умолчанию 6 фото с Unsplash), `columns=3`, `minCardWidth=180`, `gap=12`,
`radius=260`, `softness=0.6`, `damping=0.45`, `fadeOut=0.6`, `grayscale=1`,
`dim=0.12`, `glow=0.5`, `borderGlow=1`, `reveal='spotlight'`
(`spotlight|card`), `aspectRatio='3 / 2'`, `cardRadius=22`, `showInfo=true`,
`frame=false`, `theme='dark'`, `className`.

## Анимации

Позиция и сила прожектора хранятся в CSS-переменных `--chroma-x`,
`--chroma-y`, `--chroma-power`; rAF экспоненциально подтягивает их к
курсору. Смещения карточек — `--chroma-ox/oy` из `getBoundingClientRect`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/ChromaGrid/ChromaGrid.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/ChromaGrid/ChromaGrid.css` — маски и цвет
- `templates/react-libriry/react-bits/src/ts-default/Components/ChromaGrid/ChromaGrid.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/ChromaGridDemo.jsx` — демо
- https://reactbits.dev/components/chroma-grid

## Зависимости

Нет внешних пакетов.

## Совместимость и адаптация

`adaptable`: эффект целиком задаётся CSS-переменными. Рецепт: курсор
заменить сценарием — путь прожектора `x/y = interpolate(frame, ключи, позиции центров карточек)`,
`power = interpolate(frame, [0, 10], [0, 1])`, писать `--chroma-x/y/power`
в inline-style корня; `--chroma-ox/oy` посчитать один раз после раскладки.
Убрать rAF и pointer-события. Картинки по умолчанию с Unsplash — заменить
на `staticFile` и дождаться загрузки (`Img` из remotion).

## Паттерны

`key-point-emphasis`, `comparison`
