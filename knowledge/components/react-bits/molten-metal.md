# MoltenMetal — `react-bits/molten-metal`

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

Раскалённый расплав: светящиеся жилы металла с белым ядром, текущие и
переплетающиеся в дымке; клик — вспышка.

## Когда использовать

Производство, «ковка» продукта, жар, энергия, трансформация материала.

## Фразы из озвучки

- «мы плавим старые подходы»
- «продукт, выкованный в огне»
- «горячая тема сезона»

## Визуальный стиль

Фиолетово-розовые жилы (`#5227FF`, `#FF9FFC`) с белым ядром, glow 1.6,
дымка 0.75.

## Входные данные

Из usage: `colors = ['#5227FF', '#FF9FFC']`, `coreColor = '#FFFFFF'`,
`speed = 0.35`, `scale = 4`, `detail = 3`, `glow = 1.6`, `thickness = 1`,
`haze = 0.75`, `mouseInteraction`, `flareOnClick`.

## Анимации

GPU-шейдер (импортов нет), течение по времени (rAF), вспышка от клика.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/MoltenMetal/MoltenMetal.jsx` (+ `MoltenMetal.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/MoltenMetal/MoltenMetal.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/MoltenMetalDemo.jsx`

## Зависимости

`react`; без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, `mouseInteraction={false}`, `flareOnClick={false}`.

## Паттерны

`transformation`, `abstract-concepts`
