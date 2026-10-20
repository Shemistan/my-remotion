# TextMorph — `motion-primitives/text-morph`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `engine:motion`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Переход одной строки в другую: совпадающие буквы физически переезжают на
новые позиции, лишние гаснут, новые проявляются (spring).

## Когда использовать

Переименование, «было → стало» в одной надписи («Copy → Copied»,
«Draft → Published», «Idea → Product»), смена статуса. Для простой
смены слова без перелёта букв — `text-loop`.

## Фразы из озвучки

- «черновик превращается в готовый продукт»
- «одна буква — и смысл меняется»
- «статус сменился на „готово“»

## Визуальный стиль

Нейтральный, текст в одну строку; spring `stiffness 280, damping 18,
mass 0.3` — бодрый, слегка пружинит.

## Входные данные

`TextMorphProps`: `children: string`; `as?` (`'p'`); `variants?`
(по умолчанию opacity `0 → 1 → 0`); `transition?` (spring выше);
`className?`, `style?`. Смена текста — через смену `children`.

## Анимации

Каждой букве id `<useId>-<буква><номер вхождения>`; `layoutId` +
`AnimatePresence mode='popLayout'`: motion измеряет старое и новое
положение одинаковых id (FLIP) и анимирует сдвиг; остальные — enter/exit.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/text-morph.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/text-morph/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/text-morph/text-morph-button.tsx` — пример

## Зависимости

`motion` (layout-анимации, `AnimatePresence`), `react` (`useId`), `@/lib/utils`.

## Совместимость и адаптация

`complex`: суть эффекта — layout-анимация motion, которая измеряет DOM
(getBoundingClientRect) между рендерами; покадрово её не воспроизвести.
Переработка: заранее посчитать x-позиции букв обеих строк (моноширинный
шрифт → `index * ch`, либо одно измерение в `useLayoutEffect` +
`delayRender`), сопоставить буквы по тем же ключам «буква+номер», затем
`x = interpolate(spring({frame, fps, config:{stiffness:280, damping:18, mass:0.3}}), [0,1], [xOld, xNew])`;
непарные буквы — opacity по кадру.

## Паттерны

`transformation`, `comparison`
