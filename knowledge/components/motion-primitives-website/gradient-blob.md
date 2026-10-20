# GradientBlob — `motion-primitives-website/gradient-blob`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Большое сильно размытое цветное пятно (градиент 135°), медленно
вращающееся, «дышащее» по размеру и форме.

## Когда использовать

Атмосферная подсветка фона за текстом или продуктом; несколько пятен —
мягкий «mesh»-фон.

## Фразы из озвучки

- «спокойно и без суеты»
- «создадим правильную атмосферу»
- «мягкий, дружелюбный продукт»

## Визуальный стиль

Цвета по умолчанию `#4F46E5 #7C3AED #EC4899`, `blur` 100 px, `opacity`
0.4; размеры `sm` 200 / `md` 400 / `lg` 600 / `xl` 800 px.

## Входные данные

`GradientBlobProps`: `colors?`; `blur?` (100); `opacity?` (0.4);
`animate?` (true); `size?: 'sm'|'md'|'lg'|'xl'` (`'lg'`); `className?`.

## Анимации

motion keyframes: `scale [1, 1.1, 0.9, 1]`, `rotate 0 → 360`,
`borderRadius [40%, 50%, 40%, 50%, 40%]`, 20 с, `easeInOut`, бесконечно.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/gradient-blur.tsx` — компонент (+ `GradientBackground`)
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Gradient Blur»

## Зависимости

`framer-motion`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `animate={false}` даёт статичный `div`; движение —
`t = (frame/fps % 20)/20`, `rotate(360t deg)`,
`scale = interpolate(t, [0, 1/3, 2/3, 1], [1, 1.1, 0.9, 1])`,
`borderRadius = interpolate(t, [0, .25, .5, .75, 1], [40, 50, 40, 50, 40])%`.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
