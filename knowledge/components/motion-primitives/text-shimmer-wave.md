# TextShimmerWave — `motion-primitives/text-shimmer-wave`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

По буквам строки бежит волна: каждая буква по очереди слегка выдвигается
в 3D (translateZ, scale, rotateY, смещение) и подсвечивается цветом, затем
возвращается.

## Когда использовать

Живой «пульс» статичной надписи: «загрузка», «в эфире», название
продукта, слоган, который держится на экране несколько секунд. Энергичнее,
чем `text-shimmer`.

## Фразы из озвучки

- «система работает в реальном времени»
- «сигнал проходит по всей цепочке»
- «скоро в эфире»

## Визуальный стиль

`perspective: 500px`; цвета через `--base-color` (#a1a1aa / dark #71717a)
и `--base-gradient-color` (#000 / dark #fff); `easeInOut`.

## Входные данные

`TextShimmerWaveProps`: `children: string`; `as?` (`'p'`); `duration?`
(1, с); `zDistance?` (10), `xDistance?` (2), `yDistance?` (-2),
`spread?` (1), `scaleDistance?` (1.1), `rotateYDistance?` (10);
`transition?`; `className?`.

## Анимации

Для буквы `i`: keyframes `[0, d, 0]` по translateZ/X/Y, scale, rotateY и
цвету; `delay = i*duration/spread/length`, `repeat: Infinity`,
`repeatDelay = length*0.05/spread`.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/text-shimmer-wave.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/text-shimmer-wave/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/text-shimmer-wave/text-shimmer-wave-basic.tsx` — пример

## Зависимости

`motion` (`motion.create`, `motion.span`), `@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: цикл с периодом `T = duration + repeatDelay`; для буквы
`local = ((t - delay_i) mod T)`, `t = frame/fps`; если `local < duration`
— `k = sin(π * local/duration)` (аппроксимация `[0,1,0]` с easeInOut),
иначе `k = 0`. Стиль: `translateZ(zDistance*k) translateX(xDistance*k)
translateY(yDistance*k) scale(1+(scaleDistance-1)*k) rotateY(rotateYDistance*k)`,
цвет — `interpolateColors(k, [0,1], [base, highlight])`.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
