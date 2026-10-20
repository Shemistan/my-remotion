# GridBackground — `motion-primitives-website/grid-background`

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

Чёрный фон с тонкой сеткой или точками и затуханием сверху/снизу.

## Когда использовать

Нейтральная «инженерная» подложка под схемы, графики, UI-макеты, код;
фон «чертёжной доски».

## Фразы из озвучки

- «разложим всё по полочкам»
- «посмотрим на архитектуру»
- «вот наш план»

## Визуальный стиль

`bg-black`; варианты `grid` (клетка 32 px), `grid-small` (8 px), `dot`
(16 px); маска `linear-gradient` по `fadeDirection`.

## Входные данные

`GridBackgroundProps`: `children?`; `variant?: 'grid'|'dot'|'grid-small'`
(`'grid'`); `color?` (`'rgba(255,255,255,0.03)'`); `fadeDirection?:
'top'|'bottom'|'both'|'none'` (`'both'`); `className?`.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/grid.tsx` — компонент (+ `GridBeams`, `PerspectiveGrid`)
- `templates/react-libriry/motion-primitives-website/tailwind.config.ts` — утилиты `bg-grid`, `bg-grid-small`, `bg-dot` (SVG data-URI)

## Зависимости

`tailwindcss` + плагин из `tailwind.config.ts`, `mini-svg-data-uri`,
`@/lib/utils`.

## Совместимость и адаптация

`adaptable`: статичный рендер. Важно: классы `bg-grid`/`bg-dot`
генерируются `matchUtilities` с цветом (`bg-grid-white/[0.02]`); голый
`bg-grid` без значения и prop `color` (пишет `--grid-color`, который
нигде не читается) могут не дать сетки — проверить; надёжнее задать
`backgroundImage` с SVG data-URI inline. Анимацию (дрейф сетки) —
`backgroundPosition` от кадра.

## Паттерны

`system-structure`, `spatial`
