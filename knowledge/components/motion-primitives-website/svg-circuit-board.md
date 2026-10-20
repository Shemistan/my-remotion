# SvgCircuitBoard — `motion-primitives-website/svg-circuit-board`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `engine:gsap`, `svg`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Сгенерированная «печатная плата»: узлы на сетке со случайным сдвигом
соединены ломаными дорожками под прямым углом; дорожки прорисовываются,
узлы «выпрыгивают» и пульсируют свечением, по дорожкам бегут точки
данных.

## Когда использовать

Фон для тем «железо», «инфраструктура», «ИИ под капотом», «данные
бегут по системе»; техно-заставка.

## Фразы из озвучки

- «данные проходят через всю инфраструктуру»
- «под капотом — сложная электроника»
- «система работает как единая схема»

## Визуальный стиль

Дорожки `rgba(139,92,246,0.3)` 1.5 px, узлы r=4 и точки r=2.5 цвета
`#8b5cf6` с glow (`feGaussianBlur` + `feMerge`); 600×400, 16 узлов.

## Входные данные

`SvgCircuitBoardProps`: `width?` (600); `height?` (400); `nodeCount?`
(16); `color?`; `glowColor?` (`'#8b5cf6'`); `animated?` (true); `speed?`
(1); `className?`.

## Анимации

GSAP timeline: дорожки `strokeDashoffset → 0` (1.5 с, stagger 0.1),
узлы `scale 0 → 1` (`back.out(2)`), бесконечная пульсация opacity; точки
данных — `getPointAtLength` по 6 первым дорожкам, бесконечно.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/svg/animated-svg.tsx` — компонент

## Зависимости

`gsap`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: раскладка узлов и выбор формы дорожек — `Math.random()` (в
`useState` и при каждом рендере в `generateCircuitPath`), длины —
`getTotalLength`, движение точек — `getPointAtLength`, многоэтапный
timeline. Переработка: генерацию на `random(seed)`, дорожки — с
`pathLength={1}` и прогрессом по кадру, узлы — `spring()`, пульсация —
`0.75 + 0.25*cos`, точки — аналитически по ломаной (3 отрезка `L`)
вместо `getPointAtLength`.

## Паттерны

`system-structure`, `relationships`, `abstract-concepts`
