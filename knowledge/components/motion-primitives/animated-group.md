# AnimatedGroup — `motion-primitives/animated-group`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Контейнер, дети которого появляются по очереди (stagger 0.1 с) одним из
10 пресетов: fade, slide, scale, blur, blur-slide, zoom, flip, bounce,
rotate, swing.

## Когда использовать

Перечисление пунктов, сетка логотипов/карточек, буллеты слайда, «три
шага». Пресеты `bounce`/`swing` — для лёгкого игривого тона, `blur-slide`
— для спокойного премиального.

## Фразы из озвучки

- «вот пять причин выбрать нас»
- «шаг первый, шаг второй, шаг третий»
- «нам доверяют эти компании»

## Визуальный стиль

Нейтральный; каждый ребёнок оборачивается в `asChild` (по умолчанию
`div`). Пружинные пресеты: zoom/flip (300/20), bounce (400/10), rotate
(200/15), swing (300/8).

## Входные данные

`AnimatedGroupProps`: `children: ReactNode`; `preset?: 'fade'|'slide'|
'scale'|'blur'|'blur-slide'|'zoom'|'flip'|'bounce'|'rotate'|'swing'`;
`variants?: {container?, item?}`; `as?` (`'div'`), `asChild?` (`'div'`);
`className?`. Все пресеты добавляют `opacity 0 → 1`.

## Анимации

Контейнер `hidden → visible` с `staggerChildren: 0.1`; элемент — пресет
(например slide `y 20 → 0`, flip `rotateX -90 → 0`, rotate `-180 → 0`).

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/animated-group.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/animated-group/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/animated-group/animated-group-preset.tsx` — пример с пресетами

## Зависимости

`motion` (`motion.create`), `react`.

## Совместимость и адаптация

`adaptable`: только анимация входа. Для ребёнка `i`:
`p = spring({frame: frame - start - i*0.1*fps, fps, config:{stiffness, damping}})`
для пружинных пресетов (или `interpolate` для fade/slide/blur) и стиль по
таблице пресетов. Аналог в Remotion — `remotion-bits/staggered-motion`.

## Паттерны

`sequence-steps`, `comparison`, `key-point-emphasis`
