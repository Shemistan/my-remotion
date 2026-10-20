# AeroShards — `react-bits/aero-shards`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `engine:other`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Рой парящих стеклянных или хромовых осколков (до ~1300) с глубиной резкости,
виньеткой и маркерами-плюсами; облако может занимать весь кадр или сторону.

## Когда использовать

Футуристичный фон для анонса, AI, «кристальной ясности», премиум-тех.
`placement = 'left' | 'right'` оставляет место под текст.

## Фразы из озвучки

- «прозрачность на каждом этапе»
- «мир разбился на тысячи возможностей»
- «будущее уже здесь»

## Визуальный стиль

Фиолетовое стекло (`#896ABD`, акцент `#A855F7`), DOF-размытие, тёмный фон.

## Входные данные

Из usage: `shardColor = '#896ABD'`, `accentColor = '#A855F7'`,
`placement = 'full'` (`full|left|right|center`), `material = 'glass'`
(`glass|chrome`), `markers = 'plus'`, `count = 1300`,
`depthOfField = 0.75`, `vignette = 0.3`, `mouseInteraction`,
`pulseOnClick`, `holdToGather`. Остальное — PropTable демо.

## Анимации

`vgpu` (`draw`, `effect`, `frame`, `storage`, `target`): парение частиц,
импульс от клика, сбор к курсору при удержании.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/AeroShards/AeroShards.jsx` (+ `AeroShards.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/AeroShards/AeroShards.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/AeroShardsDemo.jsx`

## Зависимости

`vgpu`

## Совместимость и адаптация

`complex`: цикл `frame` библиотеки `vgpu`, WebGPU-бэкенд в headless не
проверен (рецепт R6). Интерактив выключить.

## Паттерны

`abstract-concepts`, `transformation`
