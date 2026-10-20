# Glitch Cycle (bit) — `remotion-bits/bit-glitch-cycle`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Моноширинная надпись, которая сменяет фразы каждые 60 кадров: «INITIALIZING»
→ «LOADING ASSETS» → «SYSTEM ONLINE» → «WELCOME USER». На стыке фраз символы
превращаются в случайный «шум», в середине фразы проскакивает лёгкий сбой.

## Когда использовать

Статус загрузки системы, хакерская или киберпанк-эстетика, перебор
состояний («анализ… обработка… готово»). Для одного появления используй
`bit-glitch-in`, для печати с курсором — `cli-simulation`.

## Фразы из озвучки

- «система загружается»
- «идёт анализ данных… готово»
- «доступ разрешён»
- «запускаем протокол»

## Визуальный стиль

Моноширинный шрифт, капс, цифровой шум из латиницы, цифр и знаков.
Техно-эстетика. 240 кадров, 1920×1080.

## Входные данные

Props нет. Тексты лежат в `cycle.texts` (4 строки), `itemDuration 60`.
Шум задан `glitch: [1, 0, 0, 0.1, 0, 0, 1]`, `duration 60`; `split` по
умолчанию `none`.

## Анимации

- Индекс фразы считается как `floor(frame/60) % 4`.
- Прогресс внутри фразы идёт через `cycleOffset`.
- Доля подменённых символов следует кривой glitch: полный шум на краях и
  сбой 10 % в середине.
- Подмены детерминированы через `random(seed + frame)`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-text/GlitchCycle.tsx` — сцена
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/glitch-cycle.mdx` — документация
- карточка компонента: `components/remotion-bits/animated-text.md`

## Зависимости

`remotion-bits` (`AnimatedText`); `remotion` (`random`) внутри компонента.

## Совместимость и адаптация

`native`. Пока `split` равен `none`, число хуков стабильно и фразы разной
длины безопасны. Если включить `split`, фразы нужно выровнять по числу
фрагментов (см. карточку animated-text). Цвет и шрифт задать.

## Паттерны

`transformation`, `sequence-steps`, `abstract-concepts`
