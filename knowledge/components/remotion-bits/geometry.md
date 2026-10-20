# Geometry utilities — `remotion-bits/geometry`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Ничего не рисует; классы `Rect`/`Rect3D` с viewport-единицами и разбор
относительных позиций (`"50%"`, `"center"`, `"topLeft"`, кортежи).

## Когда использовать

Раскладка элементов в долях кадра: курсор указывает в точку скриншота,
частицы вылетают из угла, подписи у краёв. Основа `use-viewport-rect`.

## Фразы из озвучки

Косвенно:
- «в правом верхнем углу — уведомление»
- «смотрите сюда, в центр экрана»
- «элементы выстраиваются по краям»

## Входные данные

`Rect(width, height, x=0, y=0)`: `left top right bottom cx cy center vw vh
vmin vmax`. `Rect3D(width, height, depth, x, y, z)`: + `front back near far
centerZ center3D volume`, `resolvePoint3D(pos)`. Функции
`parseRelativeValue(val, total)`, `resolvePoint(rect, pos)`, `createRect`,
`createRect3D`. Типы `PositionDescriptor`, `PositionString` и 3D-варианты.

## Анимации

Нет.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/utils/geometry.ts` — реализация
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/utils-geometry.mdx` — справка

## Зависимости

`three` (`Vector3` для 3D-точек).

## Совместимость и адаптация

`native` (чистые вычисления). Строки без `%` парсятся как числа, нераспознанное → 0.

## Паттерны

нет
