# SpotlightCard — `react-bits/spotlight-card`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `user-events`, `svg` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Тёмная (или светлая) карточка-контейнер, по поверхности которой скользит
мягкое пятно света (круг или луч сверху), подсвечивая и кромку; опционально
плёночное зерно.

## Когда использовать

Карточка фичи/тарифа/цитаты, которой нужен «живой» премиальный акцент.
Эффект задуман под курсор — в видео использовать режим `ambient` (свет
сам дрейфует). Для бегущего по рамке градиента — `react-bits/border-glow`.

## Фразы из озвучки

- «Ключевая возможность — в центре внимания»
- «Посмотрим на тариф «Про» поближе»
- «Каждая деталь продумана»

## Визуальный стиль

Поверхность `#111111`, рамка `rgba(255,255,255,0.08)`, белый свет,
скругление 1.5rem, padding 2rem; тёмная тема «Vercel/Linear».

## Входные данные

`children`, `className`, `style`, `spotlightColor` (по умолчанию из темы),
`intensity=0.15`, `spotlightSize=240`, `softness=0.7`, `shape='circle'`
(`circle|beam`), `borderGlow=0.6`, `proximity=80`, `smoothing=0.3`,
`ambient=false`, `flare=true`, `grain=0`, `theme='dark'` (`dark|light`), `...rest`.

## Анимации

rAF-цикл ведёт позицию света за курсором с экспоненциальным сглаживанием;
при `ambient` позиция = центр + `0.34·sin(t·0.43)`, `0.3·sin(t·0.61+1.3)` —
дрейф по синусам; свет и кромка рисуются `radial-gradient` в inline-style.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/SpotlightCard/SpotlightCard.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/SpotlightCard/SpotlightCard.css` — слои и маска рамки
- `templates/react-libriry/react-bits/src/ts-default/Components/SpotlightCard/SpotlightCard.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/SpotlightCardDemo.jsx` — демо
- https://reactbits.dev/components/spotlight-card

## Зависимости

Нет внешних пакетов (React + CSS; зерно — inline SVG `feTurbulence`).

## Совместимость и адаптация

`adaptable` через ambient-логику: `t = frame/fps` (стартовая фаза в коде —
`Math.random()*60`, заменить константой/`random(seed)`), `x = w*(0.5+0.34*sin(0.43t))`,
`y = h*(0.5+0.3*sin(0.61t+1.3))`, presence 0.6; строить `gradient()` при
рендере вместо записи через ref. Можно вести свет и по заданной траектории
(«виртуальный курсор»). Pointer/scroll/focus-обработчики и
`IntersectionObserver` убрать. Без ambient — статичная карточка.

## Паттерны

`key-point-emphasis`
