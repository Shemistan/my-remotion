# KineticBurst — `remotion-boilerplate/kinetic-burst`

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

Ударная надпись: буквы по очереди выпрыгивают снизу с перелётом масштаба
(0.3→1.2→1) и щелчком поворота (−14°→4°→0).

## Когда использовать

Референс короткого слова-удара: «ВАЖНО», «FEATURES», «НОВИНКА». Для
длинного текста не подходит — 120 px.

## Фразы из озвучки

- «внимание!»
- «новинка этого сезона»
- «вот что важно»

## Визуальный стиль

120 px, 900, `SF Pro Display, SF Pro Text, Helvetica, Arial`, белый,
межбуквенный −0.03em.

## Входные данные

`KineticBurstProps`: `text: string`, `startFrame?` (0), `durationInFrames?` (50).

## Анимации

`AnimatedText`: `split: "character"`, `splitStagger: 3`, opacity [0,1],
scale [0.3,1.2,1], y [50,−8,0], rotate [−14,4,0], `easeOutQuart`.

## Исходники и документация

- `templates/remotion-components/remotion-boilerplate/src/KineticBurst.tsx` (README указывает `components/KineticBurst.tsx`, такого файла нет)

## Зависимости

`remotion`, `remotion-bits`.

## Совместимость и адаптация

`native`. UNLICENSED: без явной лицензии переиспользование кода юридически
не разрешено — только как референс идей.

## Паттерны

`key-point-emphasis`
