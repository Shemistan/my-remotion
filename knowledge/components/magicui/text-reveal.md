# TextReveal — `magicui/text-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `user-events`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Абзац крупного текста, где слова по очереди «загораются» из
полупрозрачного серого в полный цвет — как караоке-подсветка по
прогрессу.

## Когда использовать

Цитата или тезис, который диктор читает целиком: подсветка идёт
синхронно с речью. Для появления слов из ничего — `text-animate`.

## Фразы из озвучки

- «мы верим, что инструменты должны работать на человека»
- «прочитаем эту мысль вместе»
- «вот наша миссия в одном предложении»

## Визуальный стиль

Жирный текст 2xl–5xl, подложка `opacity-30` + слой с прозрачностью от
прогресса, чёрный/белый по теме. Спокойный редакционный стиль.

## Входные данные

- `children: string` (обязателен, иначе `throw`; режется по пробелам)
- `className?: string`

## Анимации

`useScroll({ target })` → `scrollYProgress`; слово `i` получает
`useTransform(progress, [i/n, (i+1)/n], [0, 1])` для opacity.
Контейнер `h-[200vh]` со `sticky` внутренним блоком.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/text-reveal.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/text-reveal.mdx` — документация

## Зависимости

`motion` (`useScroll`, `useTransform`, `motion.span`), `cn`.

## Совместимость и адаптация

`adaptable`. Убрать `useScroll` и высоту `200vh`/`sticky`; прогресс
считать из кадра (`interpolate(frame, [start, end], [0, 1])`, можно
по таймкодам озвучки), opacity слова — та же формула
`clamp((p - i/n)·n, 0, 1)`. Разметка и стили остаются.

## Паттерны

`key-point-emphasis`, `sequence-steps`
