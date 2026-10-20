# Glitch Text — `free-remotion-templates/glitch-text`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Слово с RGB-расслоением: красный и голубой слои дёргаются относительно
белого, строку режут горизонтальные «полосы разрыва»; после горячей фазы
глитч затихает до остаточного уровня, но периодически вспыхивает снова.

## Когда использовать

Сбой, взлом, кибербезопасность, «перегрузка», техно-интро, резкий акцент.
Для печати по символам — `typewriter`, для перебора символов —
`scramble-text`.

## Фразы из озвучки

- «система дала сбой»
- «и тут всё пошло не по плану»
- «хакеры получили доступ»

## Визуальный стиль

Почти чёрный фон `#0A0A0F`, белый текст 220px weight 900, слои
`#FF0033` и `#00E0FF` с `mixBlendMode: screen`. Системный стек
`-apple-system, "Segoe UI", Roboto, sans-serif`. 1920×1080, 120 кадров
(4 с), 30 fps.

## Входные данные

`GlitchTextProps`: `text` («OVERDRIVE»), `glitchColor` (`#FFFFFF` —
цвет центрального слоя), `intensity` (0.8; 0–1), `backgroundColor`
(`#0A0A0F`), `fontSize` (220), `duration` (4 с).

## Анимации

Сид меняется каждые 3 кадра (2 — во время вспышки): смещения слоёв и
срезов через `random(seed)` из `remotion`. Горячая фаза 1.2 с, спад за
0.7 с до 0.45; вспышки каждые 0.7 с, если `random('burst-i') > 0.3`.
Полосы разрыва — `clipPath: inset(calc(50% ± …))` при сильном глитче.
Появление 0.4 с, затухание последние 0.3 с.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/glitch-text/GlitchText.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `random`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`: случайность через детерминированный `random()` Remotion.
Адаптаций нет; `duration` держать равным длине композиции.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
