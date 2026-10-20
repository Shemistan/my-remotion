# DirectionCard — `animata/direction-card`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | complex |
| Флаги | `timers`, `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Чёрный виджет навигатора 208×208: дистанция до манёвра («350 m»), большая
стрелка поворота, улица; справа колонка «предыдущий/текущий/следующий»
манёвр и зелёная вертикальная шкала прогресса. Манёвры сменяются по кругу.

## Когда использовать

«Пошаговый маршрут», навигация, «следующий шаг» в процессе.

## Фразы из озвучки

- «через 350 метров поверните направо»
- «шаг за шагом к цели»
- «следующий поворот — налево»

## Визуальный стиль

Чёрный фон, белые/серые lucide-стрелки, зелёный green-300 акцент с
glow (`shadow-glow2`), пульсирующая главная стрелка.

## Входные данные

`directionValues: {distance, direction, to, iconType: ElementType}[]`
(по умолчанию `testDirectionProps`, 4 манёвра), `duration = 5000` (мс на
манёвр).

## Анимации

Два `setInterval`: смена индекса каждые `duration` и рост прогресса каждые
100 мс; `animate-pulse` на стрелке.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/direction-card.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/direction-card.mdx` — документация
- `templates/react-libriry/animata/animata/widget/direction-card.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`; утилита `shadow-glow2` из `styles/globals.css`.

## Совместимость и адаптация

`complex` по классу (таймеры управляют состоянием), но перевод прямой:
`currentIndex = Math.floor(frame / (duration/1000*fps)) % n`,
`progress = (frame % stepFrames) / stepFrames * 100`; `animate-pulse` →
opacity из `sin`. Без этого в рендере кадры не совпадут.

## Паттерны

`sequence-steps`, `spatial`
