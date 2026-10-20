# PageStagger — `motion-primitives-website/page-stagger`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Контейнер, дочерние `PageStaggerChild` которого въезжают по очереди
(сдвиг 40 px + проявление) на mount.

## Когда использовать

Пункты списка, карточки, строки текста — поочерёдное появление.
Аналоги: `motion-primitives/animated-group`, `remotion-bits/staggered-motion`
(native).

## Фразы из озвучки

- «три причины, по которым это работает»
- «по порядку: первое, второе, третье»
- «вот что входит в пакет»

## Визуальный стиль

Сдвиг 40 px, 0.6 с, кривая `[0.25, 0.1, 0.25, 1]`, stagger 0.1 с.

## Входные данные

`PageStaggerProps`: `children`; `staggerDelay?` (0.1); `direction?`
(объявлен, но в контейнере не используется); `className?`.
`PageStaggerChild`: `children`; `direction?: 'up'|'down'|'left'|'right'`
(`'up'`); `className?`.

## Анимации

Контейнер `hidden → visible` со `staggerChildren`; ребёнок
`{y|x: ±40, opacity 0} → {0, 1}`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/transitions/page-transition.tsx` — компонент

## Зависимости

`framer-motion`.

## Совместимость и адаптация

`adaptable`: передать ребёнку индекс; `p_i = interpolate(frame, [s + i*staggerDelay*fps, s + (i*staggerDelay + 0.6)*fps], [0,1], {clamp, easing: Easing.bezier(0.25, 0.1, 0.25, 1)})`
→ `opacity`, `translate(±40(1-p) px)`.

## Паттерны

`sequence-steps`, `comparison`
