# AnimatedCounter (slot) — `motion-primitives-website/animated-counter`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Число как слот-машина: каждая цифра — колонка 0–9, которая прокручивается
вверх до своей цифры; разряды стартуют с задержкой 0.1 с слева направо.

## Когда использовать

«Выпало» значение, джекпот, итоговая цифра в финале, счётчик года.
Только целые неотрицательные числа (`String(value).split('')`; точка или
минус дадут `NaN`). Это экспорт `AnimatedCounter` из `number-ticker.tsx`;
пружинный счётчик из `animated-counter.tsx` — `spring-counter`.

## Фразы из озвучки

- «и итоговая цифра…»
- «в 2026 году»
- «джекпот — 777»

## Визуальный стиль

Ячейка `fontSize × 0.6·fontSize`, цифры `font-bold text-foreground`
размером `0.8·fontSize`; `ease-out` 700 мс.

## Входные данные

`AnimatedCounterProps`: `value: number`; `fontSize?` (48, px);
`className?`.

## Анимации

`useInView` (once) переключает `translateY(-digit*fontSize px)`; движение
— CSS `transition-transform duration-700 ease-out` с
`transitionDelay: i*0.1s`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/number-ticker.tsx` — компонент

## Зависимости

`framer-motion` (`useInView`), `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: CSS-transition в Remotion не проигрывается. Убрать
`useInView` и `transition-*`; для разряда `i`
`p = interpolate(frame, [s + 0.1*i*fps, s + (0.1*i + 0.7)*fps], [0,1], {clamp, easing: Easing.out(Easing.cubic)})`,
`transform: translateY(${-digit*fontSize*p}px)`.

## Паттерны

`quantities`, `key-point-emphasis`
