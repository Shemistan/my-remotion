# WordRotate — `motion-primitives-website/word-rotate`

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

Слово, сменяющееся по таймеру с вертикальным сдвигом: новое падает
сверху (y −30 → 0), старое уходит вниз (→ 30) с затуханием.

## Когда использовать

Короткое перечисление в заголовке («для [команд / школ / бизнеса]»).
Направление обратное `flip-words` (сверху вниз), быстрее (0.3 с).

## Фразы из озвучки

- «для команд, школ и бизнеса»
- «каждый найдёт своё»
- «лучшее решение для любой задачи»

## Визуальный стиль

`inline-block`, `easeInOut` 0.3 с, `AnimatePresence mode='wait'`.
Без контейнера с фиксированной шириной — соседний текст «прыгает» при
смене длины слова.

## Входные данные

`WordRotateProps`: `words: string[]`; `interval?` (2500, мс);
`className?`.

## Анимации

`setInterval` → индекс; exit → `{opacity 0, y 30}`, enter
`{opacity 0, y -30} → {1, 0}`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/morphing-text.tsx` — компонент

## Зависимости

`framer-motion`, `react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: индекс `floor(frame/period) % n`; первые 0.3 с периода —
exit предыдущего (`opacity 1-p`, `y 30p`), следующие 0.3 с — enter
текущего (`opacity p`, `y -30(1-p)`). Задать ширину слота по самому
длинному слову.

## Паттерны

`abstract-concepts`, `comparison`
