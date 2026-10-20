# WavyBackground — `motion-primitives-website/wavy-background`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Несколько размытых полупрозрачных цветных волн (SVG-пути), плавно
меняющих форму «туда-обратно» за контентом.

## Когда использовать

Мягкий фон для заголовка, цитаты, музыкальной или «плавной» темы.

## Фразы из озвучки

- «на одной волне с клиентом»
- «всё течёт, всё меняется»
- «мягкий переход к новой теме»

## Визуальный стиль

4 волны цветов темы (`primary`, `accent`, `secondary`, `primary/0.5`),
`blur` 10 px, `waveOpacity` 0.5; цикл 3/6/10 с (`fast/medium/slow`) + 0.5 с
на волну.

## Входные данные

`WavyBackgroundProps`: `children?`; `colors?`; `blur?` (10);
`speed?: 'slow'|'medium'|'fast'` (`'medium'`); `waveOpacity?` (0.5);
`className?`, `containerClassName?`. `waveWidth` объявлен, но не
используется.

## Анимации

motion анимирует атрибут `d` между `generateWavePath(i)` и
`generateWavePath(i + 0.5)`, `easeInOut`, бесконечно.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/wavy-background.tsx` — компонент (+ `AnimatedGridPattern`, `DotPattern`)

## Зависимости

`framer-motion`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `generateWavePath` — чистая функция; аргумент
`o = i + 0.5*(0.5 - 0.5*cos(2π*t/T_i))`, `t = frame/fps`, `d` строкой в
JSX. Важно: у `<svg>` нет `viewBox`, а путь рассчитан в координатах
0–100 — без `viewBox="0 0 100 100" preserveAspectRatio="none"` волны
займут угол 100×100 px (проверить при рендере). Цвета темы — явные.

## Паттерны

`abstract-concepts`, `transformation`
