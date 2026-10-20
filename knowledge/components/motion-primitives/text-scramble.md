# TextScramble — `motion-primitives/text-scramble`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

«Расшифровка»: строка сначала состоит из случайных символов, которые
слева направо фиксируются в правильные буквы.

## Когда использовать

Технологичные/хакерские темы, «взлом», данные, ИИ, раскрытие секрета или
пароля, заголовок в киберпанк-стилистике. Не для спокойных
корпоративных роликов — там `text-effect`.

## Фразы из озвучки

- «модель расшифровывает сигнал»
- «под капотом скрывается простая идея»
- «данные превращаются в ответ»
- «пароль подобран за секунды»

## Визуальный стиль

Моноширинный шрифт смотрится лучше (задаётся `className`); набор символов
по умолчанию — латиница A–Z, a–z, 0–9.

## Входные данные

`TextScrambleProps`: `children: string`; `duration?` (0.8, с);
`speed?` (0.04, с на шаг); `characterSet?`; `as?` (`'p'`);
`trigger?` (true); `onScrambleComplete?`; `className?`; плюс любые
`MotionProps`.

## Анимации

`setInterval(speed*1000)`; `steps = duration/speed`; на шаге
`progress = step/steps` позиции `i < progress*length` показывают
исходный символ, остальные — `characterSet[Math.random()…]`; пробелы
сохраняются.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/text-scramble.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/text-scramble/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/text-scramble/text-scramble-basic.tsx` — пример

## Зависимости

`motion` (`motion.create` для тега), `react`.

## Совместимость и адаптация

`adaptable`: таймер сводится к функции от кадра. Удалить
`setInterval`/`useState`; `step = Math.floor((frame - start) / (speed*fps))`,
`progress = clamp(step/steps, 0, 1)`; случайный символ —
`characterSet[Math.floor(random(\`scr-${i}-${step}\`) * characterSet.length)]`
из `remotion` вместо `Math.random` (иначе кадры не сходятся при
повторном рендере). После `progress = 1` — исходный текст.

## Паттерны

`transformation`, `abstract-concepts`, `key-point-emphasis`
