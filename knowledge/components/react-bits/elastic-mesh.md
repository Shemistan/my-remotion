# ElasticMesh — `react-bits/elastic-mesh`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

«Надутое» слово или логотип (материалы balloon, chrome, jelly, clay) —
упругая сетка, которую можно тянуть и сминать; при появлении надувается
(`intro`) и покачивается.

## Когда использовать

Игривое раскрытие названия/логотипа, «гибкость», мягкий бренд.

## Фразы из озвучки

- «гибкость — наше второе имя»
- «продукт, который подстраивается под вас»
- «знакомьтесь — новый бренд»

## Визуальный стиль

Синий воздушный шар (`#3b5bff`) по умолчанию; пресеты chrome/jelly/clay.

## Входные данные

Из демо/usage: `text = 'Squish'` или `src` (SVG-логотип), `material`
(`balloon|chrome|jelly|clay`), `color`, `inflate = 1`, `stiffness = 0.5`,
`wobble = 0.6`, `grabRadius = 70`, `stretch = 0.5`, `press = 0.5`,
`shadow = 0.5`, `intro = true`, `theme = 'dark'`, `imageColors`.

## Анимации

WebGL2: деформируемая сетка (атрибуты `aRest`, `aStrain`), упругая
симуляция в rAF; захват и смятие указателем.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/ElasticMesh/ElasticMesh.jsx` (+ `ElasticMesh.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/ElasticMesh/ElasticMesh.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/ElasticMeshDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: упругая симуляция накопительная — рецепт R3 (фиксированный шаг,
прогон до кадра) + R1; для видео обычно хватает интро-надувания и покачивания
без указателя; логотип — `staticFile` + `delayRender`, текст — дождаться шрифта.

## Паттерны

`key-point-emphasis`, `transformation`
