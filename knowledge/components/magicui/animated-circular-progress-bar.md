# AnimatedCircularProgressBar — `magicui/animated-circular-progress-bar`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `css-animation`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Круговой индикатор-«гейдж»: дуга основного цвета на процент, остаток
кольца — второстепенным цветом с зазорами, число процентов в центре.

## Когда использовать

Доля, прогресс, выполнение плана, загрузка, «готово на 72 %», оценка/
скоринг. Для сравнения нескольких долей — несколько колец рядом.

## Фразы из озвучки

- «план выполнен на 72 процента»
- «три четверти пользователей уже перешли»
- «загрузка почти завершена»

## Визуальный стиль

SVG `viewBox 100`, r 45, толщина 10, скруглённые концы; `size-40`,
`text-2xl font-semibold`; цвета обязательны (`gaugePrimaryColor`,
`gaugeSecondaryColor`).

## Входные данные

- `value: number` (обязателен), `min?` = `0`, `max?` = `100`
- `gaugePrimaryColor: string`, `gaugeSecondaryColor: string` (обязательны)
- `className?`

## Анимации

Сам компонент статичен для данного `value`: дуги через
`strokeDasharray: calc(percent · percentToPx) circumference` и CSS
`transition 1s ease` — анимирует только смену `value` извне (в демо
значение меняет таймер). Число — `animate-in fade-in` (tw-animate-css).

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/animated-circular-progress-bar.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/animated-circular-progress-bar.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/animated-circular-progress-bar-demo.tsx` — пример (`setInterval` +10 каждые 2 с)

## Зависимости

Tailwind v4 + `tw-animate-css` (`animate-in fade-in`), `cn`.

## Совместимость и адаптация

`adaptable`. Передавать `value = interpolate(frame, [s, e], [0, target],
{easing, clamp})` на каждом кадре и выключить `transition` (иначе дуга
будет отставать на 1 с от кадра); fade числа заменить opacity из кадра.
Число в центре — округлённый `currentPercent`, т.е. счётчик получается
бесплатно.

## Паттерны

`quantities`, `growth-decline`, `comparison`
