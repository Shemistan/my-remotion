# CurtainTransition — `motion-primitives-website/curtain-transition`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `transitions-scene` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Блок с однотонной «шторкой», которая на mount въезжает поверх контента
с выбранной стороны и закрывает его (на exit — уезжает дальше).

## Когда использовать

Переход-шторка между сценами/слайдами, «перелистываем страницу»,
закрытие сцены перед новой. В Remotion для смены сцен есть
`@remotion/transitions` (`slide`, `wipe`) — этот компонент полезен как
шторка внутри одной сцены.

## Фразы из озвучки

- «переходим к следующей теме»
- «закрываем эту главу»
- «а теперь — самое интересное»

## Визуальный стиль

`absolute inset-0 z-10` цвета `color` (`#000`); 0.8 с, кривая
`[0.76, 0, 0.24, 1]`.

## Входные данные

`CurtainTransitionProps`: `children`; `color?` (`'#000'`); `direction?:
'up'|'down'|'left'|'right'` (`'up'`); `className?`.

## Анимации

`initial` за краем (`y: 100%` для up) → `animate 0%` → `exit -100%`.
Важно: на `animate` шторка закрывает контент (а не открывает).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/transitions/page-transition.tsx` — компонент (+ `SlideReveal`, `MaskReveal`, `PageStagger`)

## Зависимости

`framer-motion`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `p = interpolate(frame, [s, s + 0.8*fps], [0,1], {clamp, easing: Easing.bezier(0.76, 0, 0.24, 1)})`;
закрытие — `translateY(${100*(1-p)}%)`, открытие — `translateY(${-100*q}%)`
по второму прогрессу; между ними сменить содержимое.

## Паттерны

`transformation`, `sequence-steps`
