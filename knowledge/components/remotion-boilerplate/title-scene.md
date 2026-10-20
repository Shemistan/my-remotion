# TitleScene — `remotion-boilerplate/title-scene`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-boilerplate` (`templates/remotion-components/remotion-boilerplate`) |
| Вид | example |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | UNLICENSED (package.json, README); файла LICENSE нет — только референс идей |

## Что визуализирует

Тёмная сцена-заголовок: герой-заголовок (`HeroTitle`) влетает слева с
поворотом, ниже по словам проявляется подзаголовок (`BodyCopy`); всё под
`CameraMotionBlur`.

## Когда использовать

Референс титульного слайда с размытием движения. Для реального ролика —
аналог на `remotion-bits/animated-text` + `@remotion/motion-blur`.

## Фразы из озвучки

- «добро пожаловать»
- «тема сегодняшнего видео — …»
- «начнём с главного»

## Визуальный стиль

Фон `#0d0d0d`, заголовок 96 px 800 цвета `#86A8E7` на 35 % высоты,
подзаголовок 32 px белый 75 % на 57 %.

## Входные данные

`titleText: string`. Подзаголовок захардкожен: «Building expressive motion
with React and Remotion.» (`startFrame 30`, `durationInFrames 35`).

## Анимации

`HeroTitle` (кадры 0–20) и `BodyCopy` (30–65) внутри `CameraBlur
shutterAngle={180} samples={10}`.

## Исходники и документация

- `templates/remotion-components/remotion-boilerplate/src/components/scenes/TitleScene.tsx`

## Зависимости

`remotion`, `@remotion/motion-blur`, `remotion-bits`; `hero-title`,
`body-copy`, `motion-blur`.

## Совместимость и адаптация

`native`. Motion blur умножает рендер (samples 10 → ~10 кадров на кадр).
UNLICENSED: без явной лицензии переиспользование кода юридически не
разрешено — только как референс идей.

## Паттерны

`key-point-emphasis`
