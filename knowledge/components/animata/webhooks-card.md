# WebHooks card — `animata/webhooks-card`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Два блока-«узла» с подписями, соединённые пунктирной линией; по hover
линия становится сплошной лаймовой, рамки блоков загораются, а шарик
перекатывается от левого блока к правому — «событие ушло».

## Когда использовать

Webhook, «A отправляет данные в B», интеграция двух систем, причина →
следствие. Hover-анимацию воспроизвести по кадру.

## Фразы из озвучки

- «заказ создан — и сразу уходит в CRM»
- «система A сообщает системе B»
- «событие передаётся дальше»

## Визуальный стиль

Светлые блоки `h-24 w-48 rounded-lg border-4`, `gray-300` → `lime-500`,
500 мс; позиционирование абсолютными px (`left-[192px]`, `left-[295px]`).

## Входные данные

Именованный экспорт `WebHooks`: `leftBoxElem: string`, `rightBoxElem: string`.

## Анимации

`useState(isHovered)` по `onMouseEnter` левого блока: `transition-colors`
рамок и линии (dotted → solid), шарик `transition-transform duration-500`
`translate-x-[106px]`.

## Исходники и документация

- `templates/react-libriry/animata/animata/card/webhooks-card.tsx` — компонент
- `templates/react-libriry/animata/content/docs/card/webhooks-card.mdx` — документация
- `templates/react-libriry/animata/animata/card/webhooks-card.stories.tsx` — пример

## Зависимости

`react`.

## Совместимость и адаптация

`isHovered` заменить прогрессом `p` из кадра: шарик `translateX(106·p px)`,
цвета рамок/линии — `interpolateColors(p, [0,1], ['#d1d5db','#84cc16'])`,
стиль линии переключить при `p > 0`. Можно повторять «импульсы» в цикле.

## Паттерны

`cause-effect`, `relationships`, `system-structure`
