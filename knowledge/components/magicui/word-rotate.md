# WordRotate — `magicui/word-rotate`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Одно слово в строке, которое по таймеру сменяется следующим: старое
уезжает вниз и гаснет, новое въезжает сверху.

## Когда использовать

Перечисление вариантов в одной позиции: «для дизайнеров / разработчиков
/ маркетологов», «быстро / дёшево / надёжно». Для эффекта перетекания —
`morphing-text`.

## Фразы из озвучки

- «подходит для дизайнеров, разработчиков и маркетологов»
- «быстро, удобно, надёжно»
- «каждый найдёт своё»

## Визуальный стиль

Нейтральный; оформление — от `className` (`motion.h1`). Быстрая смена
(0.25 с easeOut), пауза 2.5 с.

## Входные данные

- `words: string[]` (обязателен)
- `duration?` = `2500` (мс между сменами)
- `motionProps?: MotionProps` = `{initial:{opacity:0,y:-50}, animate:{opacity:1,y:0}, exit:{opacity:0,y:50}, transition:{duration:0.25, ease:"easeOut"}}`
- `className?`

## Анимации

`setInterval(duration)` меняет индекс; `AnimatePresence mode="wait"`
проигрывает exit старого и enter нового `motion.h1` (ключ = слово).

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/word-rotate.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/word-rotate.mdx` — документация

## Зависимости

`motion` (`AnimatePresence`, `motion.h1`), `cn`.

## Совместимость и адаптация

`adaptable`. Индекс `= floor(frame / periodFrames) % words.length`;
внутри периода `local = frame % period`: вход `interpolate(local,
[0, 8], [-50, 0])` + opacity, выход в последние 8 кадров `0 → 50`.
`AnimatePresence` и `setInterval` убрать (или `<Series>` по словам).

## Паттерны

`sequence-steps`, `comparison`
