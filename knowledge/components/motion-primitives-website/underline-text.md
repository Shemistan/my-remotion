# UnderlineText — `motion-primitives-website/underline-text`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Слово, под которым слева направо «прорисовывается» градиентная линия
2 px (scaleX 0 → 1).

## Когда использовать

Подчеркнуть термин или цифру в момент, когда диктор её называет. В
оригинале линия появляется только по hover — в видео запускать по кадру.

## Фразы из озвучки

- «ключевое слово здесь — доверие»
- «обратите внимание на эту цифру»
- «именно это и называется продуктом»

## Визуальный стиль

`h-[2px]`, по умолчанию `bg-gradient-to-r from-purple-500 to-pink-500`,
`transform-origin: left`, `easeInOut`.

## Входные данные

`UnderlineTextProps`: `children: ReactNode`; `underlineColor?`
(классы градиента); `duration?` (0.3, с); `className?`.

## Анимации

`whileHover='hover'` → у линии `scaleX: 1` за `duration`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/gradient-text.tsx` — компонент

## Зависимости

`framer-motion`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `whileHover` и `cursor-pointer` убрать; у линии
`transform: scaleX(${interpolate(frame, [t, t + duration*fps], [0,1], {clamp, easing: Easing.inOut(Easing.ease)})})`.

## Паттерны

`key-point-emphasis`
