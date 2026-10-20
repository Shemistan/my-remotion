# CounterPreloader — `motion-primitives-website/counter-preloader`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `transitions-scene` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Полноэкранный счётчик загрузки «000 → 100» гигантскими цифрами (20vw)
на однотонном фоне; по окончании экран «уезжает» вверх шторкой
(`clip-path`), открывая следующую сцену.

## Когда использовать

Интро в стиле awwwards-сайтов, отсчёт до запуска, переход «загрузка →
продукт»; драматичный старт ролика.

## Фразы из озвучки

- «три, два, один — поехали»
- «загружаем будущее»
- «всё готово к запуску»

## Визуальный стиль

`text-[20vw] font-bold leading-none tabular-nums`, `padStart(3, '0')`;
по умолчанию белое на чёрном; кривая `[0.76, 0, 0.24, 1]`.

## Входные данные

`CounterPreloaderProps`: `color?` (`'white'`); `bgColor?` (`'black'`);
`className?`. Прогресс берётся из `usePreloader()` — нужен
`PreloaderProvider` (`minDuration?` 2000 мс, симуляция прогресса
`setInterval` 50 мс, замедление к 99).

## Анимации

Вход цифр `opacity 0 → 1, scale 0.8 → 1` (0.5 с); выход (через
`AnimatePresence`) `clipPath → polygon(0 0, 100% 0, 100% 0, 0 0)`,
0.8 с.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/transitions/preloader.tsx` — компонент (+ провайдер и другие прелоадеры)
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Preloader»

## Зависимости

`framer-motion`, `react` (context), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: провайдер и `setInterval` не нужны — передать
`progress = 100*(1 - (1 - t)^3)` (или кривую исходника) от кадра,
`t = frame/(loadFrames)`; выход — `p = interpolate(frame, [L, L + 0.8*fps], [0,1], {easing: Easing.bezier(0.76, 0, 0.24, 1)})`,
`clipPath: polygon(0 0, 100% 0, 100% ${100*(1-p)}%, 0 ${100*(1-p)}%)`;
`fixed` → `AbsoluteFill`, `20vw` → px от ширины кадра.

## Паттерны

`timeline`, `quantities`, `key-point-emphasis`
