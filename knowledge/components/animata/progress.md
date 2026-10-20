# Progress (bars) — `animata/progress`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom`, `timers`, `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Сегментированный прогресс-бар из тонких вертикальных палочек 2px через 2px
(высота 12px): заполненные палочки светлые, остальные тёмные; заполнение
бежит слева направо с задержкой 6 мс на палочку.

## Когда использовать

«Загрузка», «прогресс миграции», процент выполнения в техно-стиле, полоса
под KPI. Для круга — `animata/donut-chart`.

## Фразы из озвучки

- «перенос данных выполнен на 30 %»
- «загрузка почти завершена»
- «мы на трети пути»

## Визуальный стиль

Техно/эквалайзер: `bg-blue-100` против `bg-zinc-900/30`; в story на
`bg-zinc-400` плашке с подписью «30% progress».

## Входные данные

`progress: number` (0–100). Число палочек = `floor(offsetWidth / 4)` —
ширину задаёт родитель (в story `w-96`). Цвета зашиты в классы.

## Анимации

`setTimeout(250)` включает подсветку; `transition-all` с
`transitionDelay: index·6 ms` (`duration-75`); hover/active группы
`group/progress` — масштаб и цвет.

## Исходники и документация

- `templates/react-libriry/animata/animata/graphs/progress.tsx` — компонент
- `templates/react-libriry/animata/content/docs/graphs/progress.mdx` — документация
- `templates/react-libriry/animata/animata/graphs/progress.stories.tsx` — пример

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

Ширину (или число палочек) передать props; `setTimeout`/transition убрать;
палочка i подсвечена, если `i/bars < progress/100` и `frameMs ≥ start +
i·6` (или растянуть шаг до 1 кадра на палочку). Hover-классы удалить.

## Паттерны

`quantities`, `growth-decline`, `sequence-steps`
