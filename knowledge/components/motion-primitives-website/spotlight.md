# Spotlight — `motion-primitives-website/spotlight`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Мягкий диагональный луч прожектора (размытый эллипс в SVG), который один
раз «включается»: выплывает из угла с увеличением и проявлением. Курсор
не используется (вопреки описанию в реестре).

## Когда использовать

Хиро-сцена: заголовок или продукт «в свете софитов», раскрытие главного
героя, интро. Вариант `Spotlights` — три цветных луча (фиолетовый,
голубой, розовый).

## Фразы из озвучки

- «и вот — главный герой»
- «в центре внимания — наш продукт»
- «свет на самое важное»

## Визуальный стиль

Эллипс `fill` (по умолчанию white, `fillOpacity 0.21`) с
`feGaussianBlur stdDeviation 151`, повёрнутый матрицей; размер
`h-[169%] w-[138%] lg:w-[84%]`.

## Входные данные

`SpotlightProps`: `fill?` (`'white'`); `className?` (позиция задаётся
классами `-top-40 left-0 …`). `Spotlights`: `className?` — три луча с
фиксированными цветами и позициями.

## Анимации

`animate-spotlight`: keyframes `spotlight` 2 с ease, задержка 0.75 с,
`forwards`: `opacity 0 → 1`, `translate(-72%, -62%) scale(0.5) →
translate(-50%, -40%) scale(1)`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/spotlight.tsx` — компонент (+ `Spotlights`)
- `templates/react-libriry/motion-primitives-website/tailwind.config.ts` — keyframes `spotlight`

## Зависимости

`tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: класс `animate-spotlight` и `opacity-0` убрать;
`p = interpolate(frame, [0.75*fps, 2.75*fps], [0,1], {clamp, easing: Easing.ease})`,
`opacity: p`, `transform: translate(${-72 + 22p}%, ${-62 + 22p}%) scale(${0.5 + 0.5p})`.
У всех экземпляров один `id="filter"` — при нескольких лучах сделать id
уникальными.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
