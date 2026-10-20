# Glass Lower Third — `free-remotion-templates/lower-third-glass-card`

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

Плашка нижней трети в стиле «матового стекла»: полупрозрачная карточка с
blur, акцентной полосой слева и пульсирующим свечением; внутри имя и
должность. Выезжает снизу слева и в конце гаснет.

## Когда использовать

Представить спикера, эксперта, героя интервью; подпись к человеку в кадре.
Для заголовка раздела — chapter-title.

## Фразы из озвучки

- «с нами руководитель продукта»
- «рассказывает наш ведущий инженер»
- «слово эксперту»

## Визуальный стиль

Тёмно-синий фон `#0c1a2e`, циан `#06b6d4`, glassmorphism
(`backdropFilter: blur(14px)`, белый градиент 16→5 %), системный
sans-serif. В Root: 1920×1080, 120 кадров. Карточка 42 % ширины, 20 % высоты.

## Входные данные

`LowerThirdGlassCardProps`: `backgroundColor` (`#0c1a2e`), `accentColor`
(`#06b6d4`), `textColor` (`#f0f9ff`), `nameText` («Alex Morgan»),
`titleText` («Head of Product, Acme Inc.»).

## Анимации

Карточка: `spring` (damping 18, stiffness 90, 28 кадров) — подъём на 18 %
высоты и opacity. Имя: `spring` с кадра 12, translateY 12→0. Должность:
fade 24–42. Свечение: `0.5 + 0.5*sin(frame*0.08)`. Выход: opacity 1→0 на
кадрах 104–119 (зашито).

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/lower-third-glass-card/LowerThirdGlassCard.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`. Фон рисуется сплошным цветом — для наложения на видео убрать
`backgroundColor` у `AbsoluteFill` (иначе blur стекла размывать нечего).
Кадры выхода 104–119 привязаны к длительности 120; при другой длине
пересчитать от `durationInFrames`.

## Паттерны

`key-point-emphasis`
