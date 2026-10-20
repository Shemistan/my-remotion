# Antigravity — `react-bits/antigravity`

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

Поле частиц (капсулы, сферы, кубики, тетраэдры), которые стягиваются в
кольцо вокруг точки-«магнита»; капсулы вытягиваются в штрихи, направленные
к центру. При `autoAnimate` точка движется сама.

## Когда использовать

Притяжение, сбор сообщества, «всё сходится в одном месте», антигравитация.

## Фразы из озвучки

- «вокруг идеи собирается сообщество»
- «тысячи частиц складываются в одно кольцо»
- «гравитация больше не работает»

## Визуальный стиль

Палитра `['#5227FF', '#FF9FFC', '#B497CF']`, раскраска `conic` (вращается
вокруг центра), `radial` или `random`; есть `lightMode`.

## Входные данные

`colors`, `color`, `colorMode = 'conic'`, `colorSpeed = 0.05`,
`particleShape = 'capsule'`, `count = 1500`, `particleSize = 0.9`,
`particleVariance = 1`, `magnetRadius = 9`, `ringRadius = 7`,
`fieldStrength`, … ; в демо `autoAnimate = true`, `interactive`,
`clickBurst`, `intro`, `lightMode`. Полный список — PropTable демо.

## Анимации

Сырой WebGL2 с инстансами частиц, симуляция притяжения в rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Antigravity/Antigravity.jsx` (+ `Antigravity.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Antigravity/Antigravity.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/AntigravityDemo.jsx`

## Зависимости

`react`; сырой WebGL2 (порт эффекта, в исходниках нет three).

## Совместимость и адаптация

`complex`: рецепт R1 + накопительная симуляция частиц (R3: прогон до
кадра); `interactive={false}`, `autoAnimate` оставить — траектория магнита
тогда от времени.

## Паттерны

`relationships`, `abstract-concepts`
