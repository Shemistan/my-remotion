# Sparkles — `motion-primitives-website/sparkles`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Мерцающие искры: неподвижные точки разного размера, плавно
загорающиеся и гаснущие (twinkle), на canvas по размеру контейнера.

## Когда использовать

«Волшебство», праздник, звёздное небо, премиальный блеск за заголовком
или логотипом, финал ролика.

## Фразы из озвучки

- «добавим немного волшебства»
- «звёздный час нашего продукта»
- «праздник для всей команды»

## Визуальный стиль

Точки `particleColor` (по умолчанию `#FFF`), радиус 1–3 px, плотность
100 точек.

## Входные данные

`SparklesProps`: `particleColor?` (`'#FFF'`); `minSize?` (1); `maxSize?`
(3); `particleDensity?` (100); `speed?` (1); `className?`.

## Анимации

rAF: `opacity += fadeDirection * 0.02 * speed`, разворот на 0 и 1;
стартовые opacity и направление — `Math.random()`; `ResizeObserver` на
canvas.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/particles.tsx` — компонент

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: накопительный rAF-цикл на Canvas + `ResizeObserver`.
Переработка: для искры `i` из `random(seed)` взять позицию, размер и
фазу `φ_i`; `opacity = |((φ_i + 0.02*speed*frame*(60/fps)) mod 2) - 1|`
(треугольная волна = исходный разворот); рендер — SVG/`div` в JSX или
canvas в `useEffect` на каждый кадр; размеры — из `useVideoConfig()`.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
