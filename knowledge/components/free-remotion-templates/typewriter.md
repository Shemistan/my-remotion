# Typewriter — `free-remotion-templates/typewriter`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `icons-shapes` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Плоская SVG-иллюстрация пишущей машинки: машинка «впрыгивает», каретка
едет, клавиши по очереди подсвечиваются, на листе появляются полоски
строк; затем под машинкой проявляются крупное слово и подпись.

## Когда использовать

Тема письма, копирайтинга, журналистики, «записали историю», блог.
Важно: README обещает печать текста посимвольно с курсором, но по коду
текст не печатается — `messageText` появляется целиком пружиной, а
«строки» на бумаге — абстрактные полоски. Для настоящей печати —
`pixel-typewriter-quote` или своя реализация.

## Фразы из озвучки

- «всё начинается с первой строчки»
- «мы записали каждую историю»
- «слова на бумаге»

## Визуальный стиль

Тёмный тёплый фон `#0f0c00`, серая машинка, красная лента `#dc2626`,
белая бумага, жёлто-кремовое слово 9 % от min(w,h) weight 900, янтарная
подпись. Системный стек `-apple-system, "Segoe UI", Roboto, sans-serif`.
1080×1080, 100 кадров (3.33 с), 30 fps.

## Входные данные

`TypewriterProps`: `backgroundColor` (`#0f0c00`), `machineColor`
(`#374151`), `machineDarkColor` (`#1f2937`), `keyColor` (`#4b5563`),
`ribbonColor` (`#dc2626`), `paperColor` (`#f8fafc`), `textColor`
(`#fef9c3`), `subColor` (`#d97706`), `messageText` («Written»), `subText`
(«Words on paper»).

## Анимации

`spring` масштаба машинки (0–22); каретка/линии `interpolate` 20→72;
подсветка клавиши `floor(progress·20) % 27`; бумага сдвигается вверх по
мере строк; слово — `spring` с 74 кадра (opacity, scale 0.75→1), подпись
88→100.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/typewriter/Typewriter.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `spring`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`, адаптаций нет. Для посимвольной печати `messageText` добавить
`text.slice(0, floor(progress·len))` по кадру.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
