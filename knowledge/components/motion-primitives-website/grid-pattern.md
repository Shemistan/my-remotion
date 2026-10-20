# GridPattern — `motion-primitives-website/grid-pattern`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Сетка тонких линий в стиле Vercel (SVG `pattern`) с радиальным
затуханием к краям; дети — поверх.

## Когда использовать

Подложка под схемы, архитектуру, код, графики; «инженерный» минимализм.
Работает без плагинов Tailwind — надёжнее, чем `grid-background`.

## Фразы из озвучки

- «посмотрим на архитектуру системы»
- «всё выверено до пикселя»
- «строим на прочном фундаменте»

## Визуальный стиль

Клетка 40 px, линия 1 px, `currentColor` с `strokeOpacity` 0.06; маска
белая до 70 %, затем в чёрный.

## Входные данные

`GridPatternProps`: `cellSize?` (40); `color?` (`'currentColor'`);
`lineOpacity?` (0.06); `lineWidth?` (1); `radialFade?` (true);
`children?`; `className?`.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/premium-backgrounds.tsx` — компонент

## Зависимости

`react` (`useId`), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: чистый SVG. Движение камеры по сетке — `x/y` у `pattern`
или `patternTransform` по кадру.

## Паттерны

`system-structure`, `spatial`
