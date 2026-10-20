# LowerThird — `remotion-boilerplate/lower-third`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-boilerplate` (`templates/remotion-components/remotion-boilerplate`) |
| Вид | component |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | UNLICENSED (package.json, README); файла LICENSE нет — только референс идей |

## Что визуализирует

Титр в левом нижнем углу: название и подпись въезжают слева с проявлением,
рядом вырастает снизу вверх тонкая градиентная полоса.

## Когда использовать

Референс подписи спикера/раздела на тёмном фоне. Выхода нет — только вход.
Для MIT-аналога — `remotion-video-templates/lower-third-slide-in-bar`.

## Фразы из озвучки

- «с нами эксперт по данным»
- «раздел первый: архитектура»
- «рассказывает автор проекта»

## Визуальный стиль

Полоса 5 px градиент `#91EAE4` → `#86A8E7`; заголовок 42 px 700 белый,
подпись 24 px `#86A8E7`; отступ 80/100 px.

## Входные данные

`LowerThirdProps`: `title: string`, `subtitle: string`, `startFrame?` (0),
`durationInFrames?` (25).

## Анимации

`spring({damping:180, stiffness:120, mass:0.6})` → translateX −80→0;
opacity линейно за первую половину; полоса `scaleY` через `spring({damping:200,
stiffness:140})` с задержкой 4 кадра.

## Исходники и документация

- `templates/remotion-components/remotion-boilerplate/src/components/text/LowerThird.tsx`
- `templates/remotion-components/remotion-boilerplate/src/styles/constants.ts`

## Зависимости

`remotion`.

## Совместимость и адаптация

`native`. UNLICENSED: без явной лицензии переиспользование кода юридически
не разрешено — только как референс идей.

## Паттерны

`key-point-emphasis`
