# Chapter Title Card — `free-remotion-templates/chapter-title`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Карточка раздела: метка «Chapter 1» влетает с крупного масштаба, под ней
прочерчивается золотая линия-разделитель, затем снизу всплывают название
главы и подзаголовок. На фоне — едва заметная сетка.

## Когда использовать

Разбивка ролика на главы, переход к новому разделу, нумерованные этапы
лекции. Для простого заголовка без структуры — `text-mask-reveal`.

## Фразы из озвучки

- «глава первая: с чего всё началось»
- «переходим ко второй части»
- «итак, раздел третий — практика»

## Визуальный стиль

Тёмный `#0d1117`, золото `#d4af37`, белый заголовок weight 900, метка
weight 300 uppercase с разрядкой 12; размеры от высоты кадра
(адаптируется к портрету). Системный стек `-apple-system, "Segoe UI",
Roboto, sans-serif`. 1920×1080, 150 кадров (5 с), 30 fps.

## Входные данные

`ChapterTitleProps`: `chapterLabel` («Chapter 1»), `title` («Chapter One:
The Beginning»), `subtitle?` («Where the journey starts»), `background`
(`#0d1117`), `chapterColor` (`#d4af37`), `titleColor` (`#ffffff`).

## Анимации

Метка: scale 3→1.05→1 (кадры 0/20/40, `Easing.out(cubic)`), opacity
0→18. Линия scaleX 28→48. Внутренние `TitleReveal`/`FloatFadeIn`:
заголовок с 45 кадра, подзаголовок +8, по 9 кадров opacity+translateY 15px.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/chapter-title/ChapterTitle.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`, адаптаций нет. Цвет подзаголовка зашит
(`rgba(255,255,255,0.6)`) — для светлого фона поправить.

## Паттерны

`sequence-steps`, `timeline`, `key-point-emphasis`
