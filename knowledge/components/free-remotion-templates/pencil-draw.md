# Pencil Draw-On — `free-remotion-templates/pencil-draw`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `icons-shapes` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Нарисованный в SVG карандаш ведёт линию и прорисовывает пятиконечную
звезду (ломаная из 10 вершин); кончик карандаша следует за концом линии.
Затем снизу появляются слово и подпись.

## Когда использовать

«Создаём», «в работе», дизайн, творчество, набросок идеи. Форма жёстко
задана (звезда) — для своей фигуры нужно переписать массив точек; для
прорисовки логотипа — logo-stroke-draw.

## Фразы из озвучки

- «набросаем идею»
- «дизайн уже в работе»
- «всё начинается с простого эскиза»

## Визуальный стиль

Кремовый «бумажный» фон `#fffbeb`, тёмная линия, жёлтый карандаш с
розовым ластиком; рукодельный, дружелюбный. Системный sans-serif. В Root:
1080×1080, 100 кадров.

## Входные данные

`PencilDrawProps`: `backgroundColor` (`#fffbeb`), `pencilColor`
(`#fbbf24`), `lineColor` (`#1e293b`), `eraserColor` (`#fca5a5`),
`textColor`, `subColor`, `messageText` («Creating...»), `subText`
(«Design in progress»).

## Анимации

`drawProgress` 5–72 (`Easing.inOut(quad)`) → видимая часть ломаной
(целые сегменты + дробный хвост), позиция карандаша = последняя точка.
Карандаш `spring` по opacity; текст `spring` с 75; подпись fade 88–100.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/pencil-draw/PencilDraw.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`. Прорисовка через построение частичного `path d`, а не
`stroke-dashoffset` — подходит только для ломаных; для кривых нужен
`getPointAtLength`/`@remotion/paths`.

## Паттерны

`transformation`, `sequence-steps`
