# Lightfall — `react-bits/lightfall`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Падающие световые штрихи (как метеоры/световой дождь) со светящимися
головами, мерцанием и bloom; удержание — «варп».

## Когда использовать

Звездопад, загадать желание, поток идей, «новости сыплются», магия.

## Фразы из озвучки

- «идеи падают как звёзды»
- «поток возможностей не иссякает»
- «загадайте желание»

## Визуальный стиль

Белые штрихи на сером фоне (`#94a3b8`), bloom 0.35.

## Входные данные

Из usage: `colors = ['#ffffff']`, `backgroundColor = '#94a3b8'`,
`speed = 0.3`, `streakCount = 2`, `streakWidth = 0.8`, `twinkle = 0.3`,
`backgroundGlow = 0.1`, `headGlow = 0.6`, `bloom = 0.35`,
`mouseInteraction`, `holdToWarp`, `intro`.

## Анимации

WebGL2 (импортов нет), падение по времени (rAF), интро, варп при удержании.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Lightfall/Lightfall.jsx` (+ `Lightfall.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Lightfall/Lightfall.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/LightfallDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; `holdToWarp={false}`, варп при необходимости — по кадру.

## Паттерны

`abstract-concepts`, `timeline`
