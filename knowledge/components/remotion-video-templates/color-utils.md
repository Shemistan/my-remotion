# Палитра и цветовые хелперы — `remotion-video-templates/color-utils`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-video-templates` (`templates/remotion-components/remotion-video-templates`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Своей картинки нет: светлая «редакционная» палитра (zinc + синий акцент),
категориальные цвета для графиков и чистые функции альфы/смешения hex-цветов.

## Когда использовать

Тени, свечения и тинты, привязанные к цвету бренда из props
(`withAlpha(brand, 0.25)`), плавное смешение двух цветов по прогрессу
(`mix(a, b, t)`), раскраска серий графика по индексу.

## Фразы из озвучки

- «в фирменных цветах компании»
- «каждая линия — свой продукт»
- «цвет плавно переходит от холодного к тёплому»

## Визуальный стиль

Нейтральный светлый: `white`, `zinc50…zinc900`, `ink #09090B`, акценты
`blue600 #2563EB`, `sky500 #0EA5E9`; chartColors: blue, sky, violet,
amber, emerald, red.

## Входные данные

`palette` (const), `chartColors: string[]`, `seriesColor(index)`,
`withAlpha(hex, alpha) → "rgba(...)"`, `mix(a, b, t) → "rgb(...)"`;
hex: `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA` (альфа отбрасывается).

## Анимации

Нет; `mix` можно кормить прогрессом кадра для анимации цвета.

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/lib/colors.ts`

## Зависимости

Нет.

## Совместимость и адаптация

`native`: чистые функции без DOM. Принимает только hex (не `rgb()`/имена).

## Паттерны

`comparison`
