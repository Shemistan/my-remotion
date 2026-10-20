# Plasma — `react-bits/plasma`

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

Объёмная светящаяся плазма: закрученные клубы света, летящие на зрителя
или от него (`direction`), с бликами.

## Когда использовать

Энергия, ядро, «внутри процессора», мощный старт, sci-fi.

## Фразы из озвучки

- «энергия, которая движет прогрессом»
- «погружаемся в самое сердце системы»
- «чистая мощность»

## Визуальный стиль

Монохромная плазма (`color = '#a6a3b8'`), мягкие края (`softness`), блеск.

## Входные данные

Из usage: `color = '#a6a3b8'`, `speed = 1`, `direction = 'forward'`,
`scale = 1`, `twist = 1`, `softness = 0.5`, `shine = 1`,
`mouseInteractive = true`. Остальное — PropTable демо.

## Анимации

Сырой WebGL2: объёмный шейдер (`VOLUME`), время в rAF; курсор смещает клубы.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Plasma/Plasma.jsx` (+ `Plasma.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Plasma/Plasma.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/PlasmaDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1, `mouseInteractive={false}`.

## Паттерны

`abstract-concepts`, `transformation`
