# DotPattern — `magicui/dot-pattern`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `dom`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Фон из ровной сетки точек; в режиме `glow` точки с радиальным
градиентом мягко пульсируют яркостью и размером в случайном ритме.

## Когда использовать

Спокойный технологичный фон под текст, схемы, мокапы; `glow` — «живые
данные», «сеть узлов». Для клетки — `grid-pattern`, для мерцающих
квадратов — `flickering-grid`.

## Фразы из озвучки

- «миллионы точек данных»
- «тихий фон для главного»
- «сеть, в которой всё связано»

## Визуальный стиль

Точки `text-neutral-400/80`, шаг 16 px, радиус 1; glow: opacity
0.4↔1, scale 1↔1.5, 2–5 с easeInOut.

## Входные данные

- `width?` = `16`, `height?` = `16`, `x?` = `0`, `y?` = `0`
- `cx?` = `1`, `cy?` = `1`, `cr?` = `1`
- `glow?` = `false`, `className?`, атрибуты `svg`.

## Анимации

Размер контейнера через `getBoundingClientRect` + `window.resize`;
точки — `motion.circle` (по одной на ячейку, не `pattern`). При `glow`:
`opacity [0.4,1,0.4]`, `scale [1,1.5,1]`, `repeat: Infinity, repeatType
"reverse"`, `delay = random·5`, `duration = random·3+2`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/dot-pattern.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/dot-pattern.mdx` — документация (варианты linear-gradient, glow)

## Зависимости

`motion` (`motion.circle`), `cn`.

## Совместимость и адаптация

`adaptable`. Размер брать из `useVideoConfig()` вместо измерения;
без `glow` адаптации не нужны. Для `glow`: `delay/duration` из
`random(\`dot-${i}\`)`, фаза `((t - delay) / duration)` → треугольная
волна opacity/scale; `motion.circle` → `circle`. Тысячи `circle` на
1920×1080 (≈8000 при шаге 16) — тяжело; увеличить шаг.

## Паттерны

`abstract-concepts`, `relationships`
