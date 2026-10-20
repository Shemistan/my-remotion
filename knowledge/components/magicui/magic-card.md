# MagicCard — `magicui/magic-card`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `engine:motion`, `dom`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Карточка с «прожектором» под курсором: радиальное пятно подсвечивает
рамку градиентом `#9E7AFF → #FE8BBB` и фон; в режиме `orb` за курсором
плывёт размытый цветной шар.

## Когда использовать

В видео — карточка фичи, по которой «проезжает» свет (виртуальный
курсор), акцент на карточке в ряду. Без переработки — статичная
карточка с нейтральной рамкой.

## Фразы из озвучки

- «наведите внимание на эту функцию»
- «посмотрим поближе»
- «каждая карточка — отдельная возможность»

## Визуальный стиль

Тонкая рамка с радиальным градиентом 200 px, внутреннее пятно
`#262626` opacity 0.8; orb: 420 px, blur 60, `#ee4f27 → #6b21ef`,
`screen`/`multiply` по теме.

## Входные данные

- `mode?: "gradient"|"orb"` = `"gradient"`, `children?`, `className?`
- `gradientSize?` = `200`, `gradientFrom?` = `"#9E7AFF"`, `gradientTo?` = `"#FE8BBB"`
- gradient: `gradientColor?` = `"#262626"`, `gradientOpacity?` = `0.8`
- orb: `glowFrom?` = `"#ee4f27"`, `glowTo?` = `"#6b21ef"`, `glowAngle?` = `90`,
  `glowSize?` = `420`, `glowBlur?` = `60`, `glowOpacity?` = `0.9`

## Анимации

`onPointerMove` → `useMotionValue(mouseX/Y)` → `useMotionTemplate`
радиального градиента; orb — `useSpring` (250/30/0.6). Внутреннее
пятно появляется через `group-hover:opacity-100` + `transition 300ms`.
Глобальные слушатели `pointerout`/`blur`/`visibilitychange`; тема —
`next-themes`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/magic-card.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/magic-card.mdx` — документация

## Зависимости

`motion`, `next-themes` (`useTheme`), CSS-переменные `--color-background`,
`--color-border`, `cn`.

## Совместимость и адаптация

`adaptable`. Убрать pointer-события и `useTheme`; координаты пятна
`(x, y)` считать по кадру (траектория «курсора»), подставить в строку
`radial-gradient(${size}px circle at ${x}px ${y}px, …)` обычным
`style`; внутреннее пятно — opacity из кадра вместо `group-hover`.
Для orb — `spring()` из remotion для запаздывания.

## Паттерны

`key-point-emphasis`, `comparison`
