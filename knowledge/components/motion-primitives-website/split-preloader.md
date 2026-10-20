# SplitPreloader — `motion-primitives-website/split-preloader`

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

Экран из двух половин-шторок с процентом загрузки; по окончании половины
разъезжаются в стороны (или вверх/вниз), открывая сцену за ними.

## Когда использовать

Переход-«занавес» между сценами, раскрытие продукта, старт презентации.

## Фразы из озвучки

- «занавес поднимается»
- «открываем новую главу»
- «и вот что внутри»

## Визуальный стиль

Две `flex-1` половины цвета `color` (`#000`); текст `N%`
`text-4xl font-bold text-white` в левой/верхней; кривая
`[0.76, 0, 0.24, 1]`, 0.8 с.

## Входные данные

`SplitPreloaderProps`: `direction?: 'horizontal'|'vertical'`
(`'horizontal'`); `color?` (`'#000'`); `className?`. `progress` и
`isLoading` — из `usePreloader()`.

## Анимации

Когда `isLoading` = false: первая половина `x/y → -100%`, вторая
`→ 100%`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/transitions/preloader.tsx` — компонент

## Зависимости

`framer-motion`, `react` (context), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `p = interpolate(frame, [tOpen, tOpen + 0.8*fps], [0,1], {clamp, easing: Easing.bezier(0.76, 0, 0.24, 1)})`;
половины `translateX(${-100p}%)` и `translateX(${100p}%)` (или Y);
процент — от кадра; провайдер не нужен. Как переход между `<Sequence>`
— положить поверх следующей сцены. Аналог — `wipe`/`slide` из
`@remotion/transitions`.

## Паттерны

`transformation`, `key-point-emphasis`
