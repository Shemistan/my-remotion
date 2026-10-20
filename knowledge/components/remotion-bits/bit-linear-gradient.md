# Linear Gradient Transition (bit) — `remotion-bits/bit-linear-gradient`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Полноэкранный линейный градиент, перетекающий из тёмно-сине-фиолетового
(`#051226 → #1e0541`, 0°) в светлый голубой (`#a5d4dd → #5674b1`, 180°):
ночь сменяется днём, направление градиента переворачивается.

## Когда использовать

Подложка под заголовок, смена настроения «от тьмы к свету», переход между
главами. Для вращения — `bit-conic-gradient`, для смещения светового пятна
— `bit-radial-gradient`.

## Фразы из озвучки

- «и вот наступает новый день»
- «от проблемы — к решению»
- «всё становится яснее»

## Визуальный стиль

Спокойный, корпоративный, холодная палитра; 90 кадров, 1920×1080, easing по
умолчанию `linear`.

## Входные данные

Модульный объект `props` (не React-props): `color1Start`, `color1End`,
`color2Start`, `color2End`, `angle1` (0), `angle2` (180); `controls` — описание
полей для playground документации. `Component` читает `props` напрямую —
для переиспользования превратить в настоящие props.

## Анимации

`GradientTransition` с двумя `linear-gradient(...)` и `duration={90}`: цвета
стопов в oklch и угол (кратчайший путь, 0→180).

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/gradient-transition/LinearGradient.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/linear-gradient.mdx` — документация

## Зависимости

`remotion-bits` (`GradientTransition`); registry: `gradient-transition`.
Карточка компонента — `gradient-transition.md`.

## Совместимость и адаптация

`native`. Вынести `props` в props компонента или `defaultProps`
композиции; `controls` в видео не нужен.

## Паттерны

`transformation`, `abstract-concepts`
