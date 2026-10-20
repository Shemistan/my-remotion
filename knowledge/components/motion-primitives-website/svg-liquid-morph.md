# SvgLiquidMorph — `motion-primitives-website/svg-liquid-morph`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Органическая «амёба»: замкнутая кривая, непрерывно меняющая форму
(синусоидальный шум по 8 точкам), опционально вторая капля другим цветом.

## Когда использовать

Абстрактный живой объект: «живая система», «гибкость», «идея в процессе
рождения»; подложка под иконку или фото.

## Фразы из озвучки

- «система постоянно адаптируется»
- «идея ещё формируется»
- «живой, развивающийся продукт»

## Визуальный стиль

Заливка `#8b5cf6` (opacity 0.8), вторая — `secondaryColor` (0.6);
квадрат `size` 300 px; плавная, «желейная».

## Входные данные

`SvgLiquidMorphProps`: `color?` (`'#8b5cf6'`); `secondaryColor?`;
`speed?` (1); `complexity?` (0.4); `size?` (300); `className?`.

## Анимации

`requestAnimationFrame`: `seed += 0.015*speed` на каждый кадр браузера,
`generateBlobPath(cx, cy, r, 8, seed, complexity)` → `setAttribute('d')`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/svg/animated-svg.tsx` — компонент

## Зависимости

`react`, `@/lib/utils` (GSAP файла не используется этим компонентом).

## Совместимость и адаптация

`adaptable`: `generateBlobPath` — чистая функция, перенести. `seed`
считать из кадра: `seed = frame * 0.015 * speed * (60/fps)` (исходник
рассчитан на ~60 rAF/с), `d` — прямо в рендере; rAF и `setAttribute`
удалить.

## Паттерны

`abstract-concepts`, `transformation`
