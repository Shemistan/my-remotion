# 3D Carousel (bit) — `remotion-bits/bit-carousel-3d`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `3d-camera` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Кольцо из 8 квадратных карточек с номерами, вращающееся вокруг вертикальной
оси (оборот за 10 с); камера между шагами отъезжает назад с поворотом на
180° по Z и возвращается.

## Когда использовать

Галерея продуктов, тарифов, кейсов, «у нас много вариантов»; цикличный фон.
Для бесконечной ленты картинок — `scrolling-images`; для стопки — `bit-card-stack`.

## Фразы из озвучки

- «восемь продуктов — одна платформа»
- «выбирайте любой вариант»
- «мы перебрали десятки решений»

## Визуальный стиль

Фон `#111`, карточки 40×40 vmin цвета `var(--color-primary-hover)` с
тенью, белая цифра; 300 кадров (размер не задан в metadata).

## Входные данные

Без props: `count` 8, `radius` 60 vmin, размеры карточек зашиты; номер =
индекс+1. Для своих карточек заменить `Card` и вынести `count`.

## Анимации

Угол карточки = `i·360/count + frame·360/(fps·10)` → `Element3D` x=sin·r,
z=cos·r, `rotateY`=угол, `centered`. Три пустых `Step` (id "0", "1", "3") по
30 кадров — камера уходит на z −100 vmin и `rotateZ` 180.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/scene-3d/Carousel.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/3d-carousel.mdx` — документация

## Зависимости

`remotion` (`AbsoluteFill`, `useCurrentFrame`, `useVideoConfig`),
`remotion-bits` (`Scene3D`, `Step`, `Element3D`, `useViewportRect`). См.
`remotion-bits/element-3d`.

## Совместимость и адаптация

`native`. Определить `--color-primary-hover` или задать цвет; при 300 кадрах
и `stepDuration` 30 последний шаг держится с кадра 60 до конца.

## Паттерны

`comparison`, `quantities`, `spatial`
