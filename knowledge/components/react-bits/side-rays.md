# SideRays — `react-bits/side-rays`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Пучок тёплых и холодных лучей света, бьющих из угла кадра, с мерцанием.

## Когда использовать

Рассвет, вдохновение, «свет из окна», тёплая атмосфера; угол оставляет
место под текст.

## Фразы из озвучки

- «новый рассвет для отрасли»
- «свет пробивается сквозь сомнения»
- «тёплый приём для каждого клиента»

## Визуальный стиль

Тёплый янтарь (`#FFC46B`) + холодный голубой (`#96c8ff`), из `top-right`.

## Входные данные

Из usage: `rayColor1 = '#FFC46B'`, `rayColor2 = '#96c8ff'`,
`origin = 'top-right'`, `speed = 2.5`, `intensity = 2`, `spread = 2`,
`density = 5`, `followMouse = true`.

## Анимации

WebGL2-шейдер (импортов нет), мерцание по времени (rAF).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/SideRays/SideRays.jsx` (+ `SideRays.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/SideRays/SideRays.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/SideRaysDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, `followMouse={false}`.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
