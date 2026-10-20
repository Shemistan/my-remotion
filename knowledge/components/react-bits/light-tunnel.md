# LightTunnel — `react-bits/light-tunnel`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Тоннель из десятков «кабелей», по которым бегут световые импульсы внутрь
или наружу (`flowDirection`); клик — всплеск.

## Когда использовать

Передача данных, оптоволокно, «скорость соединения», путь внутрь системы.

## Фразы из озвучки

- «данные летят со скоростью света»
- «погружаемся вглубь инфраструктуры»
- «всё соединено»

## Визуальный стиль

Белые кабели и импульсы, 56 кабелей, перспектива к центру.

## Входные данные

Из usage: `cableColor = '#ffffff'`, `pulseColor = '#ffffff'`,
`cableCount = 56`, `pulseDensity = 0.5`, `flowDirection = 'inward'`,
`mouseInteraction`, `clickSurge`.

## Анимации

WebGL2 (импортов нет), бег импульсов по времени (rAF), интро 1.8 с.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/LightTunnel/LightTunnel.jsx` (+ `LightTunnel.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/LightTunnel/LightTunnel.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/LightTunnelDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, `mouseInteraction={false}`, `clickSurge={false}`.

## Паттерны

`system-structure`, `spatial`
