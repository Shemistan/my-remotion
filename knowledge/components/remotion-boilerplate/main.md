# Main (title → features) — `remotion-boilerplate/main`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-boilerplate` (`templates/remotion-components/remotion-boilerplate`) |
| Вид | template |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | UNLICENSED (package.json, README); файла LICENSE нет — только референс идей |

## Что визуализирует

Двухсценный ролик 5 с: тёмная сцена-заголовок (герой-заголовок влетает с
поворотом, под ним проявляется подзаголовок по словам) → переход
`clockWipe` («стрелка часов») → сцена фич: ударная надпись по буквам и три
строки фич, появляющиеся по очереди. Всё под плёночным motion blur.

## Когда использовать

Референс структуры «интро + список возможностей» с переходом и motion blur.
Код брать нельзя (нет лицензии) — воспроизводить приём на MIT-компонентах
(`remotion-bits/staggered-motion`, `remotion-video-templates/kinetic-text`).

## Фразы из озвучки

- «добро пожаловать — сегодня покажем, что умеет продукт»
- «вот три главные возможности»
- «посимвольная анимация, каскад слов и ударные надписи»

## Визуальный стиль

Тёмные фоны `#0d0d0d` и `#111827`, белый текст, акцент `#86A8E7`, шрифт
`SF Pro Display/Text, Helvetica, Arial` (системный, не загружается).
1920×1080, 30 fps, 150 кадров.

## Входные данные

zod `mainCompSchema`: `titleText`, `featuresTitle`, `featureLine1..3:
string`; дефолты в `Root.tsx`: «Welcome to Remotion», «FEATURES»,
«Character-by-character entrances», «Word-level stagger animations»,
«Punchy kinetic bursts». Константы: `TITLE_SCENE_FRAMES = 90`,
`FEATURES_SCENE_FRAMES = 90`, `TRANSITION_FRAMES = 30`, `MAIN_DURATION = 150`.

## Анимации

`TransitionSeries` + `clockWipe({width:1920, height:1080})` со
`springTiming({damping:200}, 30)`; сцены — `remotion-bits` `AnimatedText`
внутри `CameraMotionBlur` (shutterAngle 180, samples 10).

## Исходники и документация

- `templates/remotion-components/remotion-boilerplate/src/Root.tsx`
- `templates/remotion-components/remotion-boilerplate/src/compositions/Main.tsx`
- `templates/remotion-components/remotion-boilerplate/README.md`

## Зависимости

`remotion`, `@remotion/transitions` (`clock-wipe`), `@remotion/motion-blur`,
`remotion-bits` (`AnimatedText`), `zod`; сцены `title-scene`, `features-scene`.

## Совместимость и адаптация

Технически `native`. Лицензия UNLICENSED: без явной лицензии переиспользование
кода юридически не разрешено — только как референс идей. Размер clockWipe
зашит 1920×1080; текст подзаголовка в TitleScene захардкожен.

## Паттерны

`sequence-steps`, `key-point-emphasis`
