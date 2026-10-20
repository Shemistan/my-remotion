# MeshGradient — `motion-primitives-website/mesh-gradient`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

«Stripe-градиент»: плавно текущие пятна 3–5 цветов (FBM из simplex-шума
+ синусоидальное искажение), отрисованные на canvas в 1/4 разрешения.

## Когда использовать

Фон для SaaS/финтех-роликов, хиро-экран, заставка бренда — «как у
Stripe»; мягкое непрерывное движение цвета.

## Фразы из озвучки

- «платежи, которые просто работают»
- «современная платформа для бизнеса»
- «красиво и без лишних деталей»

## Визуальный стиль

Цвета `#6366f1 #8b5cf6 #ec4899 #06b6d4 #10b981`; блоки 4×4 px в canvas
1/4 размера (растягивается браузером — мягкое размытие).

## Входные данные

`MeshGradientProps`: `colors?` (3–5 hex); `speed?` (0.0005);
`scale?` (0.002); `octaves?` (4); `className?`.

## Анимации

`requestAnimationFrame(draw)`, `t = time*speed` от метки rAF (мс с
загрузки страницы); таблица перестановок шума — `Math.random()` при
создании.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/premium-backgrounds.tsx` — компонент (+ `DotPattern`, `GridPattern`, `FilmGrain`)

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: Canvas + rAF + случайная перестановка. Переработка:
`createNoise` засеять (`random('mesh-perm-' + i)` из remotion вместо
`Math.random`); `draw(frame/fps*1000)` вызывать в `useEffect([frame])`;
размер canvas — от `useVideoConfig()`, без `getBoundingClientRect`.
Попиксельный JS-цикл медленный — для длинных роликов лучше перенести
формулу в шейдер (`ThreeCanvas`).

## Паттерны

`abstract-concepts`
