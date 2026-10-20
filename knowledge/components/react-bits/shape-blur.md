# ShapeBlur — `react-bits/shape-blur`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `icons-shapes` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Размытая светящаяся фигура (контур или заливка), сквозь которую проходит
«линза» резкости с хроматической аберрацией; при `idle` линза движется
сама, иначе — за курсором.

## Когда использовать

Абстрактный фокус-акцент: «наводим резкость», «в фокусе — главное».

## Фразы из озвучки

- «наведём резкость на главное»
- «картина становится чётче»
- «фокус — на результате»

## Визуальный стиль

Белая фигура (`color = '#ffffff'`), размытие 16, хроматика 0.3.

## Входные данные

Из usage: `size = 0.6`, `fill = true`, `color = '#ffffff'`, `blur = 16`,
`lensSize = 0.3`, `lensSoftness = 0.7`, `chroma = 0.3`, `idle = true`.
Форма фигуры и прочее — PropTable демо.

## Анимации

WebGL2-шейдер, движение линзы по времени при `idle` (rAF) или за курсором.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/ShapeBlur/ShapeBlur.jsx` (+ `ShapeBlur.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/ShapeBlur/ShapeBlur.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/ShapeBlurDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1 с `idle = true`; траекторию линзы считать от кадра.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
