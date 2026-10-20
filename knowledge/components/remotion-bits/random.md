# Random utilities — `remotion-bits/random`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Ничего не рисует; детерминированные `randomFloat`, `randomInt`,
`anyElement` поверх `random(seed)` из remotion.

## Когда использовать

Разброс позиций, цветов, задержек, выбор случайной фразы/иконки — так,
чтобы каждый кадр рендера давал тот же результат (вместо `Math.random`).

## Фразы из озвучки

Косвенно:
- «звёзды рассыпаны по небу»
- «каждый раз — новый вариант»
- «хаотично, но красиво»

## Входные данные

`randomFloat(seed: number|string, min, max)`, `randomInt(seed, min, max)`
(включительно), `anyElement(seed, array)`.

## Анимации

Нет.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/utils/random.ts` — реализация
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/utils-random.mdx` — справка

## Зависимости

`remotion` (`random`).

## Совместимость и адаптация

`native`. Одинаковый seed — одинаковое значение; для разных элементов
включать индекс в seed.

## Паттерны

нет
