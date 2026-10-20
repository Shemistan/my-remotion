# StaggeredTitle — `remotion-boilerplate/staggered-title`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-boilerplate` (`templates/remotion-components/remotion-boilerplate`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | UNLICENSED (package.json, README); файла LICENSE нет — только референс идей |

## Что визуализирует

Заголовок, буквы которого по очереди поднимаются на 30 px, подрастают
0.7→1 и выпрямляются из наклона −8°.

## Когда использовать

Референс аккуратного посимвольного входа заголовка (мягче, чем
`kinetic-burst`). В ролике нигде не используется.

## Фразы из озвучки

- «тема выпуска — …»
- «глава вторая»
- «следующий раздел»

## Визуальный стиль

80 px, 800, `SF Pro Display/Text, Helvetica, Arial`, белый.

## Входные данные

`StaggeredTitleProps`: `text: string`, `startFrame?` (0),
`durationInFrames?` (45), `staggerPerChar?` (3), `fontSize?` (80), `color?`
(`#ffffff`), `easing?: EasingName` (`easeOutQuart`, тип из
`remotion-bits/dist/utils/interpolate`).

## Анимации

`AnimatedText`: `split: "character"`, opacity 0→1, y 30→0, scale 0.7→1,
rotate −8→0.

## Исходники и документация

- `templates/remotion-components/remotion-boilerplate/src/components/text/StaggeredTitle.tsx`

## Зависимости

`remotion`, `remotion-bits` (импорт типа из `dist/` — хрупко при обновлении).

## Совместимость и адаптация

`native`. UNLICENSED: без явной лицензии переиспользование кода юридически
не разрешено — только как референс идей.

## Паттерны

`key-point-emphasis`
