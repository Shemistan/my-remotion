# Wave Text — `free-remotion-templates/wave-text`

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

Буквы слова непрерывно колышутся по синусоиде со сдвигом фазы от буквы к
букве («волна»), слово проявляется; снизу всплывает подзаголовок с
разрядкой. Фон — вертикальный градиент.

## Когда использовать

Лёгкие, «живые» темы: море, музыка, звук, поток, настроение, мягкое
интро. Для резкого акцента — `bounce-in-headline` или `kinetic-word-stack`.

## Фразы из озвучки

- «на волне перемен»
- «создавай будущее»
- «всё течёт, всё меняется»

## Визуальный стиль

Градиент тёмно-синего `#0c2342` вниз на −15 % яркости, белое слово 140px
weight 700, голубой подзаголовок `#7fb3ff` 40px с разрядкой 6. Системный
стек `-apple-system, "Segoe UI", Roboto, sans-serif`. 1920×1080, 150
кадров (5 с), 30 fps.

## Входные данные

`WaveTextProps`: `text` («WAVE»), `subText?` («Shape the Future»),
`background` (`#0c2342`), `textColor` (`#ffffff`), `subTextColor`
(`#7fb3ff`), `amplitude` (18 px), `waveSpeed` (28 — кадров на период,
меньше = быстрее), `wavelength` (0.55 рад сдвига на символ).

## Анимации

Внутренний `WaveWord`: каждый символ `translateY(sin(2π·frame/waveSpeed +
i·wavelength)·amplitude·fadeIn)`; fadeIn 0→18 кадр (`Easing.out(ease)`).
Подзаголовок opacity+translateY 24→40 кадр (`Easing.out(cubic)`). Волна
бесконечна — подходит для лупа при длительности, кратной `waveSpeed`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/wave-text/WaveText.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`), `react`.

## Совместимость и адаптация

`native`, адаптаций нет. Размер шрифта зашит (140px) — длинные строки
вынести в props.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
