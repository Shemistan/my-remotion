# DottedMap — `magicui/dotted-map`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `engine:other` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Карта мира из точек (SVG) с цветными маркерами по координатам
lat/lng; маркеры могут пульсировать кругами, рядом — свои подписи
(`renderMarkerOverlay`).

## Когда использовать

География: офисы, клиенты, точки продаж, маршруты, «присутствуем в N
странах». Для 3D-вида — `globe`.

## Фразы из озвучки

- «наши офисы в Европе, Азии и Америке»
- «клиенты в 40 странах»
- «отсюда всё и началось»

## Визуальный стиль

Серые точки (`currentColor`, `text-gray-500`) радиуса 0.2 в viewBox
150×75, ряды со сдвигом (stagger), маркеры `#FF6900`; пульс 1.4 с.
Минималистичная инфографика.

## Входные данные

- `width?` = `150`, `height?` = `75`, `mapSamples?` = `5000`
- `markers?: {lat, lng, size?, pulse?}[]` = `[]`
- `dotColor?` = `"currentColor"`, `markerColor?` = `"#FF6900"`, `dotRadius?` = `0.2`
- `stagger?` = `true`, `pulse?` = `false`
- `renderMarkerOverlay?: ({marker, index, x, y, r}) => ReactNode`, атрибуты `svg`.

## Анимации

Сама карта статична (`createMap` из `svg-dotted-map` синхронно даёт
`points` и `addMarkers`). Пульс маркера — два SVG SMIL `<animate>`
(`r: r → 2.8r`, `opacity: 1 → 0`, `dur 1.4s`, второй `begin 0.7s`,
`repeatCount indefinite`).

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/dotted-map.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/dotted-map.mdx` — документация

## Зависимости

`svg-dotted-map`, `cn`.

## Совместимость и адаптация

`adaptable`. Карта без `pulse` готова как есть. SMIL Remotion не
синхронизирует: заменить `<animate>` на атрибуты из кадра — `p =
((t + phase) % 1.4)/1.4`, `r = r0·(1 + 1.8p)`, `opacity = 1 - p`.
Появление маркеров по одному — stagger через `interpolate`. Тысячи
`circle` (5000 сэмплов) рендерятся быстро, но для 4K проверить.

## Паттерны

`spatial`, `quantities`, `comparison`
