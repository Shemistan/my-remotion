# CardStack — `animata/card-stack`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | complex |
| Флаги | `engine:motion`, `timers`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Стопка карточек (по умолчанию 3 видимых слоя: верхняя, под ней −5 %/0.84,
ещё ниже −7.5 %/0.72 с поворотами ±1°): верхнюю карточку «выбрасывает»
со случайным сдвигом и поворотом, следующая пружиной поднимается на её
место; бесконечная прокрутка, автоплей.

## Когда использовать

Портфолио, отзывы, галерея фото/кейсов, «перебираем варианты». В видео
выгоднее переписать по кадру (см. ниже).

## Фразы из озвучки

- «листаем наши работы»
- «следующий кейс»
- «один за другим»

## Визуальный стиль

Нейтральный — оформление карточек снаружи (в Storybook-демо — профиль с
SVG-масками).

## Входные данные

Составной API (по changelog и коду): `CardStack`, `Viewport`, `List`,
`Card`, `Trigger` (`full` — клик по всей площади). Константы:
`DEFAULT_STACK_DEPTH 3`, `DEFAULT_AUTOPLAY_INTERVAL 4500` мс,
`STEP_COOLDOWN_MS 260`, пресеты слоёв `STACK_LAYER_PRESETS`. Полный список
props отдельных частей в этом проходе не выписан.

## Анимации

motion `AnimatePresence`: `PROMOTE_SPRING` (visualDuration 0.22, bounce 0),
`THROW_SPRING` (0.24, bounce 0.06), `PRESS_SPRING`; импульс броска
`createCardStackThrowImpulse()` с `Math.random`; учитывает
`usePrefersReducedMotion`.

## Исходники и документация

- `templates/react-libriry/animata/animata/card/card-stack.tsx` — компонент
- `templates/react-libriry/animata/content/docs/card/card-stack.mdx` — документация
- `templates/react-libriry/animata/animata/card/card-stack.stories.tsx` — пример

## Зависимости

`motion`, `@/hooks/use-prefers-reduced-motion`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: автоплей на таймере, клики, exit-анимации `AnimatePresence`,
случайный импульс. Для видео: индекс верхней карточки `floor(frame/step)`,
поза слоёв = интерполяция между `STACK_LAYER_PRESETS`, бросок — `spring`
remotion с `random(seed)`.

## Паттерны

`sequence-steps`, `comparison`
