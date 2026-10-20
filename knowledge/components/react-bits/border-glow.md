# BorderGlow — `react-bits/border-glow`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `timers`, `css-transition`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Карточка с цветной mesh-градиентной рамкой и внешним свечением, которые
загораются конусом со стороны «источника» (курсора) и усиливаются у края;
режим `animated` — один круговой проход света по рамке.

## Когда использовать

Акцент на карточке фичи, промо-блоке, «новинке»; эффектное появление
карточки. Для пятна света по поверхности — `react-bits/spotlight-card`.

## Фразы из озвучки

- «И вот наш главный козырь»
- «Новая функция уже доступна»
- «Обратите внимание на этот блок»

## Визуальный стиль

Фон `#120F17`, радиус 28px, палитра рамки `#c084fc`, `#f472b6`, `#38bdf8`,
тёплое свечение HSL `40 80 80`; неоново-премиальный.

## Входные данные

`children`, `className`, `edgeSensitivity=30`, `glowColor='40 80 80'` (HSL),
`backgroundColor='#120F17'`, `borderRadius=28`, `glowRadius=40`,
`glowIntensity=1.0`, `coneSpread=25`, `animated=false`,
`colors=['#c084fc','#f472b6','#38bdf8']`, `fillOpacity=0.5`.

## Анимации

Всё рисует CSS по двум переменным: `--cursor-angle` (направление конуса в
`conic-gradient`-маске) и `--edge-proximity` (0–100, яркость). По курсору
они пишутся в `pointermove`; при `animated` самописный tween (rAF +
`setTimeout`) проводит угол 110°→465° за ~3,75 с и гасит свечение; видимость
слоёв управляется классом `sweep-active`/`:hover` с CSS-transition opacity.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/BorderGlow/BorderGlow.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/BorderGlow/BorderGlow.css` — маски, градиенты, свечение
- `templates/react-libriry/react-bits/src/ts-default/Components/BorderGlow/BorderGlow.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/BorderGlowDemo.jsx` — демо
- https://reactbits.dev/components/border-glow

## Зависимости

Нет внешних пакетов (React + CSS).

## Совместимость и адаптация

`adaptable`: картинка — функция двух чисел. Рецепт: постоянно держать класс
`sweep-active` (иначе слои скрыты без `:hover`), отключить CSS-transition
opacity, а `--cursor-angle` и `--edge-proximity` задавать inline из кадра —
например повтор логики `animated`: угол `interpolate(frame, [0, 1.5s, 3.75s], [110, 287.5, 465])`
с easeIn/easeOut, proximity 0→100→0. `mask-composite` и `plus-lighter`
проверить в headless Chrome рендером.

## Паттерны

`key-point-emphasis`
