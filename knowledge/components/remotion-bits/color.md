# Color interpolation — `remotion-bits/color`

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

Ничего не рисует; одна функция `interpolateColorKeyframes(colors, progress,
easingFn?)` — перцептивно ровная интерполяция цепочки цветов в oklch через
culori, результат `rgb(...)`.

## Когда использовать

Смена цвета текста/фона/индикатора по смыслу: «зелёный → жёлтый → красный»,
без грязных серых середин, как в RGB. Используется в `buildMotionStyles`
(`color`, `backgroundColor`).

## Фразы из озвучки

Косвенно:
- «статус меняется с зелёного на красный»
- «температура растёт»
- «риск становится критическим»

## Входные данные

`colors: string[]` (любые CSS-цвета, понятные culori), `progress` (клампится
0…1), `easingFn?` (применяется внутри сегмента). Пустой массив →
`"transparent"`, один цвет — как есть, ошибка парсинга → `"transparent"`.

## Анимации

Нет собственных.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/utils/color.ts` — функция
- `templates/remotion-components/remotion-bits/src/culori.d.ts` — типы culori
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/utils-motion.mdx` — справка motion (использование цвета)

## Зависимости

`culori` (`interpolate`, `formatRgb`) — в package.json только devDependency
(registry ставит как зависимость).

## Совместимость и адаптация

`native`. Вне пакета поставить `culori`. Альфа-канал теряется: `formatRgb`
отдаёт `rgb`/`rgba` по culori — для прозрачности лучше отдельный `opacity`.

## Паттерны

нет
