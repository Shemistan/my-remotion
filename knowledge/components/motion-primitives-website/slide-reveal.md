# SlideReveal — `motion-primitives-website/slide-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `transitions-scene` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Блок въезжает на 60 px с выбранной стороны и проявляется — простой
универсальный вход элемента.

## Когда использовать

Вход заголовка, карточки, картинки, подписи; базовый «строительный
блок» сцен.

## Фразы из озвучки

- «перейдём к деталям»
- «вот что важно знать»
- «добавим ещё один пункт»

## Визуальный стиль

Сдвиг 60 px, 0.8 с, кривая `[0.25, 0.1, 0.25, 1]` (ease).

## Входные данные

`SlideRevealProps`: `children`; `direction?: 'up'|'down'|'left'|'right'`
(`'up'`); `delay?` (0); `className?`.

## Анимации

`whileInView` (once, margin −100px): `{y|x: ±60, opacity 0} → {0, 1}`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/transitions/page-transition.tsx` — компонент

## Зависимости

`framer-motion`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `p = interpolate(frame, [delay*fps, (delay + 0.8)*fps], [0,1], {clamp, easing: Easing.bezier(0.25, 0.1, 0.25, 1)})`
→ `opacity p`, `translate(±60*(1-p) px)`.

## Паттерны

`sequence-steps`, `key-point-emphasis`
