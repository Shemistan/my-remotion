# BorderTrail — `motion-primitives/border-trail`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Светящийся «огонёк», бегущий по рамке карточки/поля по кругу; виден
только в пределах бордера (маска).

## Когда использовать

Подсветить карточку, о которой сейчас говорят; «идёт обработка» вокруг
поля ввода или блока; акцент на тарифе/варианте при сравнении.

## Фразы из озвучки

- «обратите внимание на этот блок»
- «именно этот тариф выбирают чаще всего»
- «система уже обрабатывает запрос»

## Визуальный стиль

Квадрат `size` px (`bg-zinc-500` по умолчанию, цвет/градиент — через
`className`, например `bg-gradient-to-l from-…`) едет по
`offset-path: rect(0 auto auto 0 round {size}px)`; linear, 5 с на круг.

## Входные данные

`BorderTrailProps`: `size?` (60); `transition?` (по умолчанию
`{repeat: Infinity, duration: 5, ease: 'linear'}`); `className?`;
`style?`; `onAnimationComplete?`. Родитель должен быть `relative` со
скруглением (`rounded-[inherit]`).

## Анимации

motion анимирует `offsetDistance: ['0%', '100%']`.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/border-trail.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/border-trail/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/border-trail/border-trail-card-1.tsx` — пример с карточкой

## Зависимости

`motion`, `@/lib/utils` (`cn`); CSS `offset-path: rect()` и
`mask-composite: intersect` (поддерживаются в Chromium, который использует
Remotion).

## Совместимость и адаптация

`adaptable`: заменить motion на
`offsetDistance: \`${((frame % (5*fps)) / (5*fps)) * 100}%\`` в style
обычного `div`. Маска и offset-path — статичный CSS, оставить.

## Паттерны

`key-point-emphasis`, `comparison`
