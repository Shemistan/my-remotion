# MorphingText — `motion-primitives-website/morphing-text`

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

Фразы по кругу сменяют друг друга через размытие: старая уходит вверх с
blur 8px, новая выплывает снизу и фокусируется. Несмотря на комментарий
в коде про SVG-фильтры, используется только CSS `filter: blur`.

## Когда использовать

Смена тезисов/слоганов в одной точке экрана, «мысль перетекает в
другую». Мягче, чем `flip-text`.

## Фразы из озвучки

- «идея превращается в план, план — в продукт»
- «сначала хаос, потом порядок»
- «одна мысль сменяет другую»

## Визуальный стиль

`inline-block`, `easeInOut` 0.5 с, `AnimatePresence mode='wait'` —
сначала полностью уходит старая, затем входит новая.

## Входные данные

`MorphingTextProps`: `texts: string[]`; `interval?` (3000, мс);
`className?`.

## Анимации

`setInterval` → индекс; enter `{opacity 0, y 20, blur 8px} → {1, 0, 0}`,
exit `→ {opacity 0, y -20, blur 8px}`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/morphing-text.tsx` — компонент (+ `TypingText`, `FlipText`, `WordRotate`)

## Зависимости

`framer-motion`, `react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `period = interval/1000*fps`, `index = floor(frame/period) % n`,
`local = frame % period`; режим `wait`: в `[0, 0.5 с)` — exit предыдущего
(`p` 0→1: `opacity 1-p`, `y -20p`, `blur 8p`), в `[0.5, 1 с)` — enter
текущего (`opacity p`, `y 20(1-p)`, `blur 8(1-p)`), далее — статично.

## Паттерны

`transformation`, `abstract-concepts`
