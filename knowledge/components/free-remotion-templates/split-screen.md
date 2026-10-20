# Split Screen — `free-remotion-templates/split-screen`

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

Кадр делится на две контрастные панели (слева/справа или сверху/снизу):
каждая раскрывается clip-path-вайпом от центра, по середине выстреливает
цветной разделитель, затем в панелях поднимаются заголовок и подпись.

## Когда использовать

«До и после», «было/стало», «мы против конкурентов», два варианта решения.
Для сравнения цифрами лучше бар-чарт.

## Фразы из озвучки

- «раньше было так, а теперь — вот так»
- «сравним старый подход и новый»
- «слева — проблема, справа — решение»

## Визуальный стиль

Серая панель `#1f2937` против голубой `#0ea5e9`, жёлтый разделитель
`#fbbf24`, заголовки 96 px weight 900 с разрядкой; системный sans-serif.
В Root: 1920×1080, 150 кадров.

## Входные данные

`SplitScreenProps`: `direction: "horizontal" | "vertical"` (horizontal),
`panelA` / `panelB: {heading, sub?, bg, textColor}` (Before/The old way,
After/Powered by AI), `dividerColor` (`#fbbf24`), `dividerWidth` (6),
`backdropColor?` (`#0b1220`).

## Анимации

`SplitScreenReveal` (delay 6, duration 36): первая панель `inset()` 50 %→0
за первую половину, вторая — за вторую (`Easing.out(ease)`); разделитель
opacity и scale около середины. Тексты панелей: opacity + y 24→0 с кадров
22 и 40 (`Easing.out(cubic)`).

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/split-screen/SplitScreen.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`, адаптации не нужны. Внутренний `SplitScreenReveal` принимает любые
два `children` — можно подставить картинки/видео вместо текстовых панелей.

## Паттерны

`comparison`, `transformation`, `cause-effect`
