# OrganicBlobBackground — `motion-primitives-website/organic-blob-background`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `engine:three`, `webgl` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Пять мягких светящихся пятен одного цвета, кружащих вокруг центра по
меняющимся орбитам и сливающихся друг с другом на тёмном фоне.

## Когда использовать

Спокойный фон «живой системы», сообщества, взаимодействия; подложка под
логотип по центру.

## Фразы из озвучки

- «всё вращается вокруг клиента»
- «экосистема, которая живёт»
- «люди объединяются вокруг идеи»

## Визуальный стиль

Пятна `#8b5cf6` на `#0f0f0f`, мягкость края 0.3, смешение ×0.8;
время ×0.3.

## Входные данные

`OrganicBlobBackgroundProps`: `blobColor?` (`'#8b5cf6'`);
`backgroundColor?` (`'#0f0f0f'`); `className?`. Uniform `uBlobCount`
объявлен в шейдере, но не задаётся и не используется (цикл на 5).

## Анимации

`uTime` из часов R3F; центры пятен — `cos/sin(angle)` с радиусами,
модулированными `sin(time…)`, `smoothstep`-капли.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/shader-backgrounds.tsx` — компонент

## Зависимости

`@react-three/fiber`, `three`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: `ThreeCanvas` + `uTime = frame/fps`. Альтернатива без WebGL —
5 размытых `div`/SVG-кругов, позиции по тем же формулам в JSX.

## Паттерны

`relationships`, `abstract-concepts`
