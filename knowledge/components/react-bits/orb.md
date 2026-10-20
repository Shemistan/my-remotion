# Orb — `react-bits/orb`

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

Светящаяся сфера-кольцо из переливающегося градиента (три цвета) с
мягким шлейфом; на hover искажается и вращается, может следовать за
курсором.

## Когда использовать

«Голос»/AI-ассистент, ядро продукта, энергия в центре кадра, фон под
логотип или одно слово.

## Фразы из озвучки

- «знакомьтесь — ваш AI-ассистент»
- «в центре всего — одна идея»
- «энергия, которая питает систему»

## Визуальный стиль

Фиолетово-голубое свечение (`#9c43fe`, `#4cc2e9`, `#101499`) на тёмном.

## Входные данные

Из usage: `colors = ['#9c43fe', '#4cc2e9', '#101499']`, `hoverIntensity = 1`,
`trail = 1`, `rotateOnHover`, `followCursor`. Остальное — PropTable демо.

## Анимации

Сырой WebGL2 (`FOCAL = 3.2`), время в rAF, интро 1.1 с, искажение и
поворот от hover.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Orb/Orb.jsx` (+ `Orb.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Orb/Orb.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/OrbDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1; `followCursor` и `rotateOnHover` выключить, при
необходимости «hover» задать уровнем по кадру (акцент на фразе).

## Паттерны

`key-point-emphasis`, `abstract-concepts`
