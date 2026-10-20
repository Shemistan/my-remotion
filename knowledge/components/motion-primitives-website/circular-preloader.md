# CircularPreloader — `motion-primitives-website/circular-preloader`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `timers`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Полноэкранный экран загрузки: кольцо прогресса с числом в центре; на
выходе кольцо увеличивается вдвое и гаснет.

## Когда использовать

Интро-загрузка, обратный отсчёт, «готовность системы», сцена-переход
перед раскрытием результата.

## Фразы из озвучки

- «система почти готова»
- «загрузка завершена на 90 процентов»
- «ещё мгновение»

## Визуальный стиль

Кольцо 120 px, `strokeWidth` 4, фон кольца `#333`, дуга `color`
(`#fff`), число `text-2xl font-bold text-white`; фон `bgColor` (`#000`);
выход `scale 2`, `opacity 0`, 0.6 с.

## Входные данные

`CircularPreloaderProps`: `size?` (120); `strokeWidth?` (4); `color?`
(`'#fff'`); `bgColor?` (`'#000'`); `className?`. Прогресс — из
`usePreloader()`.

## Анимации

`strokeDashoffset` от `C` к `C - progress% * C` (motion по умолчанию);
выход через `AnimatePresence`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/transitions/preloader.tsx` — компонент

## Зависимости

`framer-motion`, `react` (context), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `progress` от кадра; `strokeDashoffset = C*(1 - progress/100)`
на обычном `circle`, число — `Math.round(progress)`; выход
`scale(1 + q)`, `opacity 1 - q` по кадру; провайдер не нужен. Близкий
не-полноэкранный вариант — `circular-progress`.

## Паттерны

`quantities`, `timeline`
