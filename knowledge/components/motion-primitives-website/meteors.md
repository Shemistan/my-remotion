# Meteors — `motion-primitives-website/meteors`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Метеоры — точки с хвостом 50 px, падающие по диагонали (215°) из
верхней части кадра и гаснущие; случайные позиции, задержки и скорости.

## Когда использовать

Ночное небо, космос, «идеи падают как звёзды», фон для интро и
финальных титров; декоративный слой поверх тёмного фона.

## Фразы из озвучки

- «загадайте желание»
- «в мире больших возможностей»
- «каждая идея — как падающая звезда»

## Визуальный стиль

Точка 2 px `bg-slate-500`, хвост `from-[#64748b] to-transparent`;
траектория `rotate(215deg) translateX(0 → -500px)`, opacity гаснет после
70 %.

## Входные данные

`MeteorsProps`: `number?` (20); `className?`.

## Анимации

Tailwind `animate-meteor` (keyframes `meteor`, 5 с, linear, infinite),
у каждого метеора `animationDelay` 0–5 с и `animationDuration` 2–10 с из
`random()` (`Math.random`) в `useEffect`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/meteors.tsx` — компонент (+ `ShootingStars`)
- `templates/react-libriry/motion-primitives-website/tailwind.config.ts` — keyframes `meteor`
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Meteors»

## Зависимости

`react`, `tailwindcss`, `@/lib/utils` (`random` = `Math.random`).

## Совместимость и адаптация

`adaptable`: параметры брать из `random(\`m-${i}-top\`)` и т.п. remotion
(без `useEffect`); для метеора `i` локальное время
`u = ((frame/fps - delay_i) mod dur_i) / dur_i` →
`transform: rotate(215deg) translateX(${-500*u}px)`,
`opacity: u < 0.7 ? 1 : 1 - (u - 0.7)/0.3`; класс `animate-meteor`
убрать (или keyframes + отрицательный `animationDelay` от кадра +
`paused`).

## Паттерны

`abstract-concepts`, `spatial`
