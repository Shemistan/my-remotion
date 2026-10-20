# AnimatedBeam — `magicui/animated-beam`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom`, `svg`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Линия-связь (прямая или дуга) между двумя элементами схемы, по которой
бежит светящийся градиентный импульс — «данные текут от A к B».

## Когда использовать

Интеграции, потоки данных, архитектура «сервис → хаб → сервисы»,
«вход → обработка → выход». Ставится поверх контейнера с иконками-узлами;
по одному экземпляру на ребро.

## Фразы из озвучки

- «данные из всех источников стекаются в одно место»
- «подключается к вашим любимым инструментам»
- «запрос уходит на сервер и возвращается ответом»

## Визуальный стиль

Серая подложка-путь (opacity 0.2, 2 px) + импульс `#ffaa40 →
#9c40ff`; easeOutExpo, 5 с, бесконечно. Чисто, «SaaS-лендинг».

## Входные данные

- `containerRef`, `fromRef`, `toRef: RefObject<HTMLElement>` (обязательны)
- `curvature?` = `0`, `reverse?` = `false`
- `pathColor?` = `"gray"`, `pathWidth?` = `2`, `pathOpacity?` = `0.2`
- `gradientStartColor?` = `"#ffaa40"`, `gradientStopColor?` = `"#9c40ff"`
- `delay?` = `0`, `duration?` = `5`, `repeat?` = `Infinity`, `repeatDelay?` = `0`
- `startXOffset/startYOffset/endXOffset/endYOffset?` = `0`, `className?`

## Анимации

Путь `M start Q mid,startY-curvature end` из `getBoundingClientRect`
трёх элементов (+ `ResizeObserver`). `motion.linearGradient` с
`gradientUnits="userSpaceOnUse"` анимирует `x1: 10% → 110%`, `x2: 0% →
100%` (reverse — наоборот), ease `[0.16, 1, 0.3, 1]`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/animated-beam.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/animated-beam.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/animated-beam-multiple-outputs.tsx` — пример «хаб → много выходов»

## Зависимости

`motion` (`motion.linearGradient`), `cn`.

## Совместимость и адаптация

`adaptable`. Измерение DOM сделать один раз в `useLayoutEffect` под
`delayRender` или (лучше) передавать координаты узлов числами — в
видео раскладка известна. Градиент: `p = Easing.bezier(0.16,1,0.3,1)(
((t - delay) % (duration + repeatDelay))/duration)`, `x1 = 10 + 100p %`,
`x2 = 100p %`, обычный `linearGradient`. «Рисование» связи — добавить
`stroke-dashoffset` по кадру.

## Паттерны

`relationships`, `system-structure`, `cause-effect`
