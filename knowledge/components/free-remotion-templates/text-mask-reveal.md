# Text Mask Reveal — `free-remotion-templates/text-mask-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Столбик из нескольких строк капсом; каждую строку по очереди перекрывает
цветной блок, скользящий слева направо, и, уходя, открывает текст под
собой (классический «block reveal»). В конце под столбиком прочерчивается
линия.

## Когда использовать

Заголовок из 2–4 строк, тезисы-слоганы, редакторская подача «как в
журнале». Важно: README описывает «текст выезжает из-под маски», по коду
это вайп цветным блоком. Для падения слов — `kinetic-word-stack`.

## Фразы из озвучки

- «дизайн в движении»
- «три слова о нашем подходе»
- «запишите главное»

## Визуальный стиль

Тёмно-синий `#050818`, бирюзовый блок `#22d3ee` со свечением, светлый
текст `#ecfeff` weight 800, строка 17 % высоты кадра, радиальное свечение
в углу. Системный стек `-apple-system, "Segoe UI", Roboto, sans-serif`.
1920×1080, 110 кадров (3.67 с), 30 fps.

## Входные данные

`TextMaskRevealProps`: `backgroundColor` (`#050818`), `accentColor`
(`#22d3ee`), `textColor` (`#ecfeff`), `lines: string[]` («DESIGN», «IN»,
«MOTION»). Строки переводятся в верхний регистр.

## Анимации

Строка i стартует на `8 + i·22`: фаза перекрытия 11 кадров (правая
граница блока), фаза раскрытия 13 кадров (левая граница +
`clipPath: inset()` текста), easeInOut-квадратичная; лёгкий подъём текста.
Линия — после старта последней строки, 22 кадра.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/text-mask-reveal/TextMaskReveal.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`. Блок ездит по всей ширине кадра (left/right в % от ширины), а
не по ширине текста; при 4+ строках проверить длительность (beat 22).

## Паттерны

`key-point-emphasis`, `sequence-steps`
