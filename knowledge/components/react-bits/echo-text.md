# EchoText — `react-bits/echo-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Слово с шлейфом полупрозрачных копий-«эхо»: на входе копии разлетаются в
сторону и с запаздыванием догоняют основное слово, сходясь в одно; затем
шлейф тянется за курсором, сам дрейфует восьмёркой или отстаёт при скролле;
клик пускает расходящиеся «волны».

## Когда использовать

Скорость, инерция, ретро/синтвейв, «эхо прошлого», повторяемость;
энергичный тайтл. Для мягкого фокуса — `react-bits/blur-text`.

## Фразы из озвучки

- «Скорость, которая оставляет след»
- «Эхо этого решения слышно до сих пор»
- «Всё повторяется, но каждый раз чуть иначе»

## Визуальный стиль

12 копий с затуханием 0.72, blur до 3px, оттенок `#7dd3fc` (или градиент
`echoColors`), сдвиг 36px; кегль `clamp(3rem, 9vw, 7rem)`/800 — динамично,
«моушн-дизайнерски».

## Входные данные

`text='Motion Echo'`, `echoes=12` (0–24), `lag=0.24`, `offset=36`,
`direction='right'` (`right|left|up|down|diagonal`), `fade=0.72`, `blur=3`,
`tint='#7dd3fc'`, `echoColors`, `echoStyle='solid'` (`solid|outline`),
`echoScale=1`, `mode='both'` (`entrance|pointer|both`), `trail='pointer'`
(`pointer|auto|scroll`), `clickBurst=true`, `cursorRadius=320`, `duration=900`,
`ease='ease-out'` (`linear|ease-out|ease-in-out|snappy`),
`fontSize='clamp(3rem, 9vw, 7rem)'`, `fontWeight=800`, `color='currentColor'`,
`className`, `style`.

## Анимации

rAF: желаемая позиция копии `i` — функция времени (вход
`(1 - ease(elapsed/duration)) * offset * (i + 0.35)`, дрейф по `sin(phase)`),
но фактическая позиция догоняет её экспоненциальным `lerp`, разным для каждой
копии (из этого и рождается шлейф); opacity — через сглаженную «активность».
Клик клонирует узлы в слой вспышек.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/EchoText/EchoText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/EchoText/EchoText.css` — слои копий
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/EchoText/EchoText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/EchoTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/echo-text

## Зависимости

Нет внешних пакетов.

## Совместимость и адаптация

`complex`: эффект держится на накапливаемом сглаживании. Варианты: (1)
детерминированно прогонять тот же фильтр от кадра 0 до текущего (шаг 1/fps,
≤24 копии — дёшево) при рендере; (2) заменить на задержку:
`pos_i(t) = desired(t - i*lag*k)` с `interpolate`, opacity копий
`fade^i * (1 - progress)`. Для видео брать `mode='entrance'` или
`trail='auto'`; курсор, скролл и clickBurst убрать.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
