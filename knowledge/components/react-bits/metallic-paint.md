# MetallicPaint — `react-bits/metallic-paint`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `icons-shapes` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Логотип (из `imageSrc`, напр. SVG) или слово (`text`), залитые жидким
металлом: переливающиеся блики текут по форме, края изогнуты
(`edgeBend`).

## Когда использовать

Раскрытие логотипа, премиальное название продукта, финальный кадр.

## Фразы из озвучки

- «знакомьтесь — наш новый бренд»
- «качество, отлитое в металле»
- «запомните это имя»

## Визуальный стиль

Хром/золото (в примере `color = '#f2c46b'`), глянцевые переливы.

## Входные данные

Из usage: `imageSrc` (картинка/SVG) или `text`, `color`, `edgeBend = 0.9`
(пример). Остальное — PropTable демо.

## Анимации

WebGL2-шейдер (рабочий размер маски `WORKING_SIZE = 512`), течение бликов
по времени (rAF).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/MetallicPaint/MetallicPaint.jsx` (+ `MetallicPaint.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/MetallicPaint/MetallicPaint.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/MetallicPaintDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; маска из картинки — `staticFile` + `delayRender`
до загрузки и построения маски; для `text` — дождаться шрифта.

## Паттерны

`key-point-emphasis`, `transformation`
