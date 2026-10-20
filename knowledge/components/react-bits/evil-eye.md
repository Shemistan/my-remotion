# EvilEye — `react-bits/evil-eye`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `engine:other`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Огненный «глаз»: пылающая радужка с языками пламени на шуме и тёмным
зрачком, который следит за курсором (`pupilFollow`).

## Когда использовать

Наблюдение, контроль, угроза, «всевидящее око», мистика, кибербез.

## Фразы из озвучки

- «за вами наблюдают»
- «мы видим всё»
- «угроза, которую нельзя игнорировать»

## Визуальный стиль

Оранжевое пламя (`eyeColor = '#FF6F37'`) на чёрном, свечение.

## Входные данные

Из usage: `eyeColor = '#FF6F37'`, `intensity = 1.5`, `pupilSize = 0.6`,
`irisWidth = 0.25`, `glowIntensity = 0.35`, `scale = 0.8`,
`noiseScale = 1.0`, `pupilFollow = 1.0`, `flameSpeed = 1.0`,
`backgroundColor = '#000000'`.

## Анимации

OGL (`Renderer`, `Program`, `Mesh`, `Triangle`, `Texture` — текстура шума),
пламя по времени в rAF, зрачок за указателем.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/EvilEye/EvilEye.jsx` (+ `EvilEye.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/EvilEye/EvilEye.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/EvilEyeDemo.jsx`

## Зависимости

`ogl`

## Совместимость и адаптация

`complex`: рецепт R1 (OGL), `pupilFollow = 0` или положение зрачка по
траектории от кадра.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
