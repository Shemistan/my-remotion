# Prism — `react-bits/prism`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Светящаяся стеклянная пирамида-призма, преломляющая свет в радужные
переливы; вращается (`animationType = 'rotate'`) или иначе движется.

## Когда использовать

Ясность, «разложим на спектр», грани решения, премиум-тех, AI-эстетика.

## Фразы из озвучки

- «посмотрим на задачу со всех сторон»
- «одна идея — целый спектр решений»
- «прозрачность и чистота»

## Визуальный стиль

Радужный неон, glow 1, тёмный фон, геометрично.

## Входные данные

Из usage: `animationType = 'rotate'`, `timeScale = 0.5`, `height = 3.5`,
`baseWidth = 5.5`, `scale = 3.6`, `hueShift = 0`, `colorFrequency = 1`,
`glow = 1`. Другие варианты `animationType` и интерактив — PropTable демо.

## Анимации

WebGL2-шейдер (импортов библиотек нет), вращение по времени, интро 1.4 с.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Prism/Prism.jsx` (+ `Prism.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Prism/Prism.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/PrismDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; угол вращения задавать из кадра.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
