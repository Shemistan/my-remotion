# LampContainer — `motion-primitives-website/lamp-container`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `layout-templates` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Упрощённая «лампа»: сверху раскрывается большой размытый цветной ореол,
поперёк проходит тонкая светящаяся линия, под ней — контент.

## Когда использовать

Лёгкий вариант `lamp` для заголовка раздела или цитаты, когда полная
сцена с конусами избыточна.

## Фразы из озвучки

- «новая глава»
- «самое важное — здесь»
- «давайте остановимся на этом подробнее»

## Визуальный стиль

Ореол 30×40rem, `blur-[120px] opacity-30`, цвет `color` или
`hsl(var(--primary))`; линия `h-px max-w-2xl from-transparent
via-primary to-transparent`; `min-h-[50vh]`.

## Входные данные

`LampContainerProps`: `children`; `color?`; `className?`.

## Анимации

`whileInView`: ореол `opacity 0 → 1, scale 0.5 → 1` (1 с, easeOut);
линия `scaleX 0 → 1` (0.8 с, easeInOut).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/lamp.tsx` — компонент

## Зависимости

`framer-motion`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `whileInView` → `p1 = interpolate(frame, [0, fps], [0,1], {clamp, easing: Easing.out(Easing.ease)})`
для ореола (`opacity p1`, `scale(0.5 + 0.5p1)`),
`p2 = interpolate(frame, [0, 0.8*fps], [0,1], {clamp})` для линии
`scaleX(p2)`; `via-primary` заменить явным цветом.

## Паттерны

`key-point-emphasis`
