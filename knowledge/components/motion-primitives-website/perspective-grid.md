# PerspectiveGrid — `motion-primitives-website/perspective-grid`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Сетка-«пол», уходящая в перспективу (`rotateX(75deg)`), гаснущая к
горизонту — ретро-синтвейв/Tron-плоскость.

## Когда использовать

Фон «цифровой мир», дорога в будущее, ретро-футуризм, сцена для 3D-
объекта или заголовка.

## Фразы из озвучки

- «дорога в будущее»
- «добро пожаловать в цифровой мир»
- «впереди — бесконечные возможности»

## Визуальный стиль

`bg-black`, `perspective: 1000px`, сетка `bg-grid-white/[0.05]`, маска
`linear-gradient(to bottom, black 20%, transparent 80%)`.

## Входные данные

`children?`, `className?`.

## Анимации

Нет (статичная перспектива).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/grid.tsx` — компонент

## Зависимости

`tailwindcss` (+ `bg-grid-*` из `tailwind.config.ts`), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: статичный рендер; «движение вперёд» добавить через
`backgroundPosition: \`0 ${(frame/fps)*speedPx}px\`` у слоя сетки (шаг
32 px → бесшовно по модулю). Сетку надёжнее задать inline SVG
data-URI, если в проекте нет плагина `bg-grid`.

## Паттерны

`spatial`, `timeline`, `abstract-concepts`
