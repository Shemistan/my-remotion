# FeaturesScene — `remotion-boilerplate/features-scene`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-boilerplate` (`templates/remotion-components/remotion-boilerplate`) |
| Вид | example |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | UNLICENSED (package.json, README); файла LICENSE нет — только референс идей |

## Что визуализирует

Сцена «возможности»: сверху ударная надпись по буквам (`KineticBurst`),
ниже три строки фич появляются по очереди с шагом 15 кадров, каждая —
мягкий подъём по словам; всё под motion blur.

## Когда использовать

Референс слайда-перечисления: «три причины», «что нового», «возможности».
Для реального ролика — `remotion-bits/staggered-motion`.

## Фразы из озвучки

- «вот три главные возможности»
- «что вы получаете»
- «во-первых, во-вторых и в-третьих»

## Визуальный стиль

Фон `#111827`, надпись 120 px 900 белая на 18 % высоты, строки 32 px
белые 75 % на 42/56/70 %.

## Входные данные

`featuresTitle`, `featureLine1`, `featureLine2`, `featureLine3: string`.
Ровно три строки (массив собирается внутри).

## Анимации

`KineticBurst` (0–35); строки — `Sequence from={20 + i*15}` +
`BodyCopy` (25 кадров); обёртка `CameraBlur`.

## Исходники и документация

- `templates/remotion-components/remotion-boilerplate/src/components/scenes/FeaturesScene.tsx`

## Зависимости

`remotion`, `@remotion/motion-blur`, `remotion-bits`; `kinetic-burst`,
`body-copy`, `motion-blur`.

## Совместимость и адаптация

`native`. `key={feature}` — одинаковые строки дадут конфликт ключей.
UNLICENSED: без явной лицензии переиспользование кода юридически не
разрешено — только как референс идей.

## Паттерны

`sequence-steps`, `key-point-emphasis`
