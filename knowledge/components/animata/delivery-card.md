# DeliveryCard — `animata/delivery-card`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Тёмный виджет 208×208 отслеживания заказа, похожий на багажную бирку:
«Arrives today 09:26», статус (Processing / In transit / Delivered)
янтарным, линия пути с грузовиком, местоположение и «30 min ago».

## Когда использовать

Логистика, e-commerce, «заказ уже в пути», прогресс доставки. Отлично
анимируется — грузовик едет по линии.

## Фразы из озвучки

- «ваш заказ уже в пути»
- «прибудет сегодня в 9:26»
- «доставлено!»

## Визуальный стиль

zinc-800/700 слои, амбер-акцент, иконка грузовика в круге; утилитарно,
«как в трекинге посылок».

## Входные данные

`className?`, `progress = 42` (0–100), `arrivalTime = "09:26"`,
`location = "Pokhara"`, `timeAgo = "30 min"`, `simulateProgress = false`
(демо). Статус и заголовок вычисляются из прогресса (0 / 100).

## Анимации

Ширина линии — `transition-[width] duration-500`; при
`simulateProgress` — `setInterval(3000)` +30% по кругу.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/delivery-card.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/delivery-card.mdx` — документация
- `templates/react-libriry/animata/animata/widget/delivery-card.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `simulateProgress` не использовать, `progress` передавать из
`interpolate(frame, [a, b], [0, 100], {extrapolateRight: "clamp"})`;
статус «Delivered/Arrived» переключится сам на 100. Убрать класс
transition, чтобы не было рассинхрона.

## Паттерны

`timeline`, `sequence-steps`, `growth-decline`
