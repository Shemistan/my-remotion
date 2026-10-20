# GridBeams — `motion-primitives-website/grid-beams`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Чёрный фон с еле заметной сеткой (радиальная маска сверху) и тремя
вертикальными светящимися лучами (cyan, violet, fuchsia), которые
пульсируют со сдвигом.

## Когда использовать

Техно-фон для заголовка, анонса, «три направления / три столпа»;
подложка под карточки.

## Фразы из озвучки

- «три направления развития»
- «технологии, которые мы используем»
- «на стыке трёх областей»

## Визуальный стиль

Лучи `w-px h-full bg-gradient-to-b from-transparent via-*-500/50
to-transparent` на 1/4, 2/4, 3/4 ширины; `animate-pulse` с задержками
0 / 0.5 / 1 с.

## Входные данные

`children?`, `className?` (props без отдельного типа).

## Анимации

Tailwind `animate-pulse` (стандартный keyframes: opacity 1 → 0.5 → 1,
2 с) на лучах.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/grid.tsx` — компонент

## Зависимости

`tailwindcss` (+ утилита `bg-grid-*` из `tailwind.config.ts`), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `animate-pulse` убрать; для луча `i`
`opacity = 0.75 + 0.25*cos(2π*(frame/fps - 0.5i)/2)`. Можно добавить
«пробег» луча — `translateY` градиента по кадру.

## Паттерны

`comparison`, `system-structure`
