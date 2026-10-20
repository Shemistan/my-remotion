# MorphingText — `magicui/morphing-text`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Крупное слово «перетекает» в следующее: буквы размываются и
слипаются, как капли (SVG-фильтр порога альфы поверх blur), затем
проявляется новое слово.

## Когда использовать

Смена понятий одно в другое: «идея → прототип → продукт», перебор
синонимов, трансформация. Не для длинных фраз (одна строка до ~12
символов при 6rem).

## Фразы из озвучки

- «из идеи — в прототип, из прототипа — в продукт»
- «сначала хаос, потом порядок»
- «одно превращается в другое»

## Визуальный стиль

Жирный sans-serif 40pt/6rem по центру, «жидкий» органичный морф,
монохром (цвет — от `className`).

## Входные данные

- `texts: string[]` (обязателен)
- `className?: string`
Константы в коде: `morphTime = 1.5` с, `cooldownTime = 0.5` с.

## Анимации

Хук `useMorphingText` крутит `requestAnimationFrame`, считает `dt` по
`new Date()`, на двух `span` императивно пишет `style.filter =
blur(8/f-8 px)` и `opacity = f^0.4`. Контейнер с
`filter: url(#threshold) blur(0.6px)`; фильтр `feColorMatrix` с альфой
`255 -140` даёт эффект слипания.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/morphing-text.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/morphing-text.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/morphing-text-demo.tsx` — пример

## Зависимости

React, `@/lib/utils`. Пакетов нет.

## Совместимость и адаптация

`adaptable` (логика — чистая функция времени). Удалить rAF; из кадра:
`t = frame/fps`, `cycle = 2.0`, `i = floor(t/cycle)`,
`f = clamp((t % cycle)/1.5, 0, 1)`; рендерить `texts[i]` и
`texts[i+1]` со стилями из той же формулы. SVG-фильтр оставить (id
`threshold` глобальный — при двух экземплярах переименовать).

## Паттерны

`transformation`, `sequence-steps`, `abstract-concepts`
