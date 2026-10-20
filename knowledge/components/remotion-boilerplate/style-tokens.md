# Дизайн-токены и easing — `remotion-boilerplate/style-tokens`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-boilerplate` (`templates/remotion-components/remotion-boilerplate`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | UNLICENSED (package.json, README); файла LICENSE нет — только референс идей |

## Что визуализирует

Своей картинки нет: цвета, шрифтовой стек и именованные кривые easing.

## Когда использовать

Референс практики «одна точка для easing и токенов». Значения кривых —
стандартные (easings.net), их можно задать самостоятельно.

## Фразы из озвучки

- «плавно и мягко»
- «резкий старт, мягкая остановка»
- «в фирменных цветах»

## Визуальный стиль

`COLOR_1 #86A8E7` (синий), `COLOR_2 #91EAE4` (бирюзовый),
`FONT_FAMILY "SF Pro Text, Helvetica, Arial, sans-serif"`.

## Входные данные

`constants.ts`: `COLOR_1`, `COLOR_2`, `FONT_FAMILY`. `easing.ts`:
`EASE_OUT_QUART` (bezier 0.25,1,0.5,1), `EASE_IN_OUT_CUBIC` (0.65,0,0.35,1),
`EASE_OUT_EXPO` (0.16,1,0.3,1), `EASE_IN_QUART` (0.5,0,0.75,0), `EASE_LINEAR`.

## Анимации

Нет.

## Исходники и документация

- `templates/remotion-components/remotion-boilerplate/src/styles/constants.ts`
- `templates/remotion-components/remotion-boilerplate/src/styles/easing.ts`

## Зависимости

`remotion` (`Easing`).

## Совместимость и адаптация

`native`. Шрифт SF Pro не загружается — на Linux-рендере упадёт на
Helvetica/Arial. UNLICENSED: без явной лицензии переиспользование кода
юридически не разрешено — только как референс идей.

## Паттерны

`key-point-emphasis`
