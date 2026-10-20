# CrystalizedBall — `react-bits/crystalized-ball`

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

Хрустальный шар с плазмой внутри: потрескивающие разряды и свечение
(пресеты, например `plasma`); реагирует на hover.

## Когда использовать

Предсказание, будущее, «магия AI», прогноз, мистический акцент.

## Фразы из озвучки

- «заглянем в будущее»
- «прогноз на следующий год»
- «немного магии искусственного интеллекта»

## Визуальный стиль

Розовая плазма (`color = '#F25BD0'`), размер 0.7.

## Входные данные

Из usage: `preset = 'plasma'`, `color = '#F25BD0'`, `size = 0.7`,
`crackle = 0.85`, `fill = 0.5`, `interactive`, `hoverStrength = 0.7`.
Другие пресеты — PropTable демо.

## Анимации

OGL-шейдер, разряды по времени (rAF), усиление от hover.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/CrystalizedBall/CrystalizedBall.jsx` (+ `CrystalizedBall.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/CrystalizedBall/CrystalizedBall.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/CrystalizedBallDemo.jsx`

## Зависимости

`ogl`

## Совместимость и адаптация

`complex`: рецепт R1 (OGL), `interactive = false`.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
