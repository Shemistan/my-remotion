# GridScan — `react-bits/grid-scan`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

3D-коридор из линий сетки, уходящий вглубь, по которому периодически
проходит светящаяся полоса сканирования; клик — «пинг».

## Когда использовать

Сканирование, анализ, проверка безопасности, поиск, AI «изучает данные».
Ритм задаётся `scanDuration`/`scanDelay` — удобно под озвучку.

## Фразы из озвучки

- «система сканирует каждый байт»
- «ищем уязвимости»
- «анализ завершён»

## Визуальный стиль

Серые линии (`#4d4757`), голубой скан (`#7dd3fc`), 8 ячеек, глубина 3.

## Входные данные

Из usage: `linesColor = '#4d4757'`, `scanColor = '#7dd3fc'`, `cells = 8`,
`depth = 3`, `scanDuration = 2.4`, `scanDelay = 1.6`, `clickEffect = 'ping'`.
До 4 пингов. Остальное — PropTable демо.

## Анимации

WebGL2 (без библиотек), скан по расписанию во времени (rAF), пинг от клика.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/GridScan/GridScan.jsx` (+ `GridScan.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/GridScan/GridScan.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/GridScanDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; фазу скана считать из кадра
(`(t % (scanDuration + scanDelay))`), пинги — по списку кадров.

## Паттерны

`spatial`, `sequence-steps`
