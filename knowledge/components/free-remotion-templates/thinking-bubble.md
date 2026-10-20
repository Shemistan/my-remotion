# Thinking Bubble — `free-remotion-templates/thinking-bubble`

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

SVG-персонаж в задумчивой позе поднимает голову; к большому облаку мысли
цепочкой вырастают три пузырька, в облаке по очереди мигают три точки,
ниже появляется курсивная подпись («Hmm...»).

## Когда использовать

Вопрос, сомнение, размышление, «а что если…», пауза перед ответом. Для
диалога людей — community-chat.

## Фразы из озвучки

- «и тут мы задумались»
- «а что, если сделать иначе?»
- «хороший вопрос — давайте разберёмся»

## Визуальный стиль

Светлый тёплый фон `#fafaf9`, серо-коричневый персонаж, белое облако с
серой обводкой; спокойный минимализм; системный sans-serif. В Root:
1080×1080, 120 кадров.

## Входные данные

`ThinkingBubbleProps`: `backgroundColor` (`#fafaf9`), `characterColor`,
`bubbleColor`, `bubbleBorder`, `dotColor`, `thoughtText` («Hmm...»),
`textColor`, `showText: boolean` (true).

## Анимации

Вход персонажа `spring`; наклон головы 0→−12° на 6–24; пузырьки `spring` с
задержками 14/20/26; облако `spring` с 30 + «дыхание» `sin(frame*0.08)`;
точки с 44 — цикл 24 кадра со сдвигом фаз; текст `spring` с 55.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/thinking-bubble/ThinkingBubble.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`. Цвет зрачков выбирается сравнением `backgroundColor === "#fafaf9"`
— при смене фона зрачки станут белыми; вынести в отдельный prop.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
