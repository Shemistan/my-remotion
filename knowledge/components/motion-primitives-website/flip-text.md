# FlipText — `motion-primitives-website/flip-text`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Фразы сменяются 3D-переворотом, как перекидное табло: новая
откидывается сверху (`rotateX 90 → 0`), старая уходит вниз (`→ -90`).

## Когда использовать

Смена статуса/варианта с ощущением «щелчка»: табло вылетов, счёт,
«было → стало». Механичнее, чем `morphing-text`.

## Фразы из озвучки

- «следующий пункт назначения»
- «статус меняется на „выполнено“»
- «переворачиваем страницу»

## Визуальный стиль

`overflow-hidden perspective-1000`, `origin-bottom`, `preserve-3d`;
кривая `[0.16, 1, 0.3, 1]`, 0.4 с. Класс `perspective-1000` не входит в
стандартный Tailwind 3 — в проекте его может не быть (не найден в
`tailwind.config.ts`).

## Входные данные

`FlipTextProps`: `texts: string[]`; `interval?` (3000, мс); `className?`.

## Анимации

`setInterval` → индекс; `AnimatePresence mode='wait'`: exit
`rotateX -90, opacity 0`, затем enter `rotateX 90 → 0, opacity 0 → 1`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/morphing-text.tsx` — компонент

## Зависимости

`framer-motion`, `react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: индекс `floor(frame/period) % n`; в начале периода 0.4 с —
exit предыдущего (`rotateX(-90p)`, `opacity 1-p`), следующие 0.4 с — enter
(`rotateX(90(1-p))`, `opacity p`), `p` с `Easing.bezier(0.16, 1, 0.3, 1)`;
`perspective: 1000px` задать inline.

## Паттерны

`transformation`, `sequence-steps`
