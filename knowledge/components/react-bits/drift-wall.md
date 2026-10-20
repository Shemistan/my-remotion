# DriftWall — `react-bits/drift-wall`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `user-events`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Бесконечная стена плиток-изображений в перспективе (наклон, поворот):
колонки плывут вверх и вниз навстречу друг другу с разной скоростью,
края стены растворяются; при наведении плитка приподнимается.

## Когда использовать

Фон для заголовка, «огромное портфолио», лента пользовательского контента,
масштаб («тысячи клиентов»), интро-сцена.

## Фразы из озвучки

- «Тысячи проектов уже создано на платформе»
- «Каждый день — новый контент»
- «Посмотрите, сколько всего вокруг»

## Визуальный стиль

Плитки 200×132, gap 18, радиус 14, наклон 16°, поворот −14°, перспектива
1200, оверлей `#060010` и затемнение краёв; глянцевый «агентский» фон.

## Входные данные

`items` (`{image, title, href}`; по умолчанию 15 фото picsum.photos),
`columns=5`, `tileWidth=200`, `tileHeight=132`, `gap=18`, `radius=14`,
`tilt=16`, `turn=-14`, `roll=0`, `perspective=1200`, `depth=120`, `speed=42`
(px/с), `direction='up'`, `variance=0.45`, `parallax=0.6`,
`pauseOnHover=false`, `lift=64`, `fade=0.6`, `dim=0.55`, `grayscale=false`,
`overlayColor='#060010'`, `className`, `style`.

## Анимации

rAF: у колонки `c` базовая скорость `speed * (1 + variance*pseudo(c)) * dir * (±1 через одну)`,
смещение `offset = (offset0 + v*t) mod copyHeight` → `translate3d(0, -offset)`;
стартовое смещение `copyHeight * ((c*0.37) % 1)`; плоскость наклоняется за
курсором с затуханием.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/DriftWall/DriftWall.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/DriftWall/DriftWall.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/DriftWall/DriftWall.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/DriftWallDemo.jsx` — демо
- https://reactbits.dev/components/drift-wall

## Зависимости

Нет внешних пакетов (React + CSS 3D).

## Совместимость и адаптация

`adaptable`: дрейф — функция времени. Рецепт: `offset_c = mod(copyHeight*((c*0.37)%1) + v_c*frame/fps, copyHeight)`
(в оригинале скорость плавно разгоняется с 0 — можно добавить `interpolate`
на первые ~0,3 с), `transform` трека считать в рендере; плоскость — статичный
`rotateX(tilt) rotateY(turn)`. Pointer-параллакс и hover убрать,
`ResizeObserver` → высота композиции, `loading='lazy'` → `Img` + `staticFile`.

## Паттерны

`quantities`, `abstract-concepts`
