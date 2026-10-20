# VariableFontText — `motion-primitives-website/variable-font-text`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Кинетическая типографика: насыщенность (`wght`) и ширина (`wdth`)
каждой буквы волной «дышат» по синусоиде — слово как будто пульсирует.

## Когда использовать

Интро, бренд-заставка, тема ритма, музыки, «живого» продукта; фон-слово,
которое долго стоит в кадре. Требует вариативного шрифта.

## Фразы из озвучки

- «почувствуйте ритм»
- «бренд, который живёт»
- «гибкость — наше главное качество»

## Визуальный стиль

`inline-flex flex-wrap`, `font-variation-settings: 'wght' N, 'wdth' M`;
диапазон веса по умолчанию 300–900, период 2 с, сдвиг 50 мс на букву.

## Входные данные

`VariableFontTextProps`: `text: string`; `fontFamily?` (вариативный
шрифт); `trigger?: 'auto'|'hover'|'scroll'|'mouse'` (`'auto'`);
`weightRange?` ([300, 900]); `widthRange?`; `cycleDuration?` (2000, мс);
`stagger?` (50, мс); `fontSize?`; `as?` (`'span'`); `className?`.
Режим `scroll` в коде не реализован (ведёт себя как статичный).

## Анимации

auto: `requestAnimationFrame` + `Date.now()`,
`progress = (sin(((t + i*stagger)/cycleDuration)·2π) + 1)/2`; mouse —
вес по близости буквы к `clientX`; hover — CSS `transition-all 300ms`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/premium-text.tsx` — компонент

## Зависимости

`react`, `@/lib/utils`; вариативный шрифт (в Remotion — загрузить через
`@remotion/google-fonts` или `staticFile` + `delayRender`).

## Совместимость и адаптация

`adaptable`: формула уже чистая функция времени — заменить `Date.now()`
на `frame/fps*1000`, `requestAnimationFrame`/`useState` удалить, вес
считать прямо в рендере. Режимы mouse/hover не использовать.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
