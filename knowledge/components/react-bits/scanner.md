# Scanner — `react-bits/scanner`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Полосы цвета, по которым проходит луч сканирования (вертикально или
горизонтально) со шлейфом, рябью и строчной развёрткой (scanline).

## Когда использовать

Сканирование документа/лица/кода, анализ, «проверяем всё», AI-распознавание.

## Фразы из озвучки

- «сканируем каждую деталь»
- «алгоритм распознаёт образы»
- «проверка пройдена»

## Визуальный стиль

`#5227FF`, `#FF9FFC`, `#FFFFFF`, 11 полос, scanline 0.5.

## Входные данные

Из usage: `color1/2/3`, `speed = 0.5`, `sweepSpeed = 0.25`,
`sweepWidth = 1.6`, `trail = 0.5`, `ripple = 0.22`, `bandDensity = 11`,
`glow = 0.6`, `scanDirection = 'vertical'`, `colorSpread = 0.7`,
`scanline`, `scanlineIntensity = 0.5`, `mouseInteraction`,
`clickEffect = 'ping'` (до 6 пингов).

## Анимации

GPU-шейдер (импортов нет), проход луча по времени (rAF), пинги от кликов.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Scanner/Scanner.jsx` (+ `Scanner.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Scanner/Scanner.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/ScannerDemo.jsx`

## Зависимости

`react`; без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; фазу луча считать из кадра, пинги — список кадров.

## Паттерны

`sequence-steps`, `key-point-emphasis`
