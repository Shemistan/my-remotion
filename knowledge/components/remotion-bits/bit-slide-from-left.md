# Slide from Left Text (bit) — `remotion-bits/bit-slide-from-left`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Строка текста целиком въезжает слева на 400 px с одновременным
проявлением.

## Когда использовать

Простой заголовок/подзаголовок, подпись, тезис, который «приходит» в кадр;
минимальная анимация без отвлечения. Для пословного эффекта —
`bit-word-by-word`/`bit-blur-slide-word`.

## Фразы из озвучки

- «следующая тема — безопасность»
- «итак, главное»
- «переходим к результатам»

## Визуальный стиль

Нейтральный: без собственного оформления (шрифт, цвет, фон — от
родителя); мягкий easeInOut, 90 кадров, 1920×1080.

## Входные данные

Без props: текст `"Sliding Text"` дочерним узлом `AnimatedText`;
`transition = {opacity: [0, 1], x: [-400, 0], easing: "easeInOut"}`
(длительность по умолчанию = fps кадров, split `"none"`).

## Анимации

`AnimatedText` без split: один span, `translateX` −400→0 и opacity 0→1 по
`useMotionTiming`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/staggered-motion/SlideFromLeft.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/slide-from-left.mdx` — страница bit

## Зависимости

`remotion-bits`: `AnimatedText` (лежит в папке staggered-motion, но
StaggeredMotion не использует).

## Совместимость и адаптация

`native`. Добавить фон, типографику и позиционирование; `-400` px —
абсолютное значение, для других разрешений пересчитать от `vw`.

## Паттерны

`key-point-emphasis`, `sequence-steps`
