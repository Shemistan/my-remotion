# FundWidget — `animata/fund-widget`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `user-events`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Белая карточка-стопка (масштаб 0.72 в квадрате 208px): крупное значение
актива «2.7Cr», изменение «12% ↑» зелёным или «−8% ↓» красным, подпись
категории (Stocks / Funds / Deposits) и вертикальные точки-индикаторы
справа. Карточки листаются вертикальным свайпом.

## Когда использовать

Инвестиции/портфель, «акции выросли на 12%», сравнение классов активов
по очереди.

## Фразы из озвучки

- «акции выросли на двенадцать процентов»
- «фонды просели на восемь»
- «листаем портфель дальше»

## Визуальный стиль

Белый, rounded-[35px], мягкая серая тень, text-6xl font-bold, цветные
стрелки роста/падения.

## Входные данные

`funds: {value: string; change: number; label: string}[]` (по умолчанию
3 элемента), `backgroundClassName?` (не используется в разметке),
`containerClassName?`.

## Анимации

`AnimatePresence` + `motion.div` `variants` incoming/active/exit (`y:
±100%`, 0.5 с, cubic-bezier); `drag="y"` со свайпом по порогу 20px, blur
и rotateY от расстояния драга, сброс через `setTimeout(500)`; точки —
`animate={{height: 30|8}}`.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/fund-widget.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/fund-widget.mdx` — документация
- `templates/react-libriry/animata/animata/widget/fund-widget.stories.tsx` — пример

## Зависимости

`motion`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: убрать drag; `activeDiv = Math.floor(frame / step) % n`,
смена — две карточки (уходящая/входящая) с `translateY` из
`interpolate(frame % step, [0, 0.5*fps], …)`; высота точек — так же.

## Паттерны

`growth-decline`, `comparison`, `quantities`
