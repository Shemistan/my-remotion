# CountryLabel — `remotion-skills/country-label`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-skills` (`official_skills/skills`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | не указана (нет LICENSE, нет поля license в package.json) |

## Что визуализирует

Подпись-маркер: светящаяся цветная черта вырастает из центра, под ней
название капсом с разрядкой; весь блок поднимается на 16px и проявляется.

## Когда использовать

Подписать точку карты, регион, узел схемы, когда известна позиция центра в
пикселях. Прогресс задаёт родитель (в `RiverReveal` — после заливки
страны).

## Фразы из озвучки

- «это Индия»
- «здесь расположен наш склад»
- «отметим столицу»

## Визуальный стиль

Картографический минимализм: uppercase, разрядка 0.16em, тень текста,
черта 64×3px с glow цвета `color`.

## Входные данные

`{ name: string; color: string; reveal: number; x: number; y: number }`
(центр в px, `reveal` 0..1). CSS-переменные с fallback:
`--map-label-font` (system-ui), `--map-label-weight` (600),
`--map-label-size` (34px), `--map-label-tracking` (0.16em),
`--map-label-color` (#ffffff), `--map-label-shadow`.

## Анимации

`e = interpolate(reveal, [0,1], [0,1], {clamp, easing: Easing.bezier(1/3, 1, 2/3, 1)})`
→ `opacity: e`, `translateY((1 − e)·16px)`, черта `scaleX(e)`.

## Исходники и документация

- `official_skills/skills/skills/remotion-maps/techniques/maptiler/assets/CountryLabel.tsx`
- использование — `official_skills/skills/skills/remotion-maps/techniques/maptiler/assets/RiverReveal.tsx`

## Зависимости

`remotion` (`interpolate`, `Easing`).

## Совместимость и адаптация

`native`: чистая функция от `reveal`, без таймеров и DOM. `reveal` вычислять
из `useCurrentFrame()` в родителе. Применим и вне карт.

## Паттерны

`key-point-emphasis`, `spatial`
