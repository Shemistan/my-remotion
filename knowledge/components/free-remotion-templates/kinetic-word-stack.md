# Kinetic Word Stack — `free-remotion-templates/kinetic-word-stack`

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

Слова по одному падают сверху и с «ударом» встают в вертикальный столбик;
последнее слово выделено акцентным цветом и свечением, через столбик
прорисовывается вертикальная линия.

## Когда использовать

Манифест из 3–5 коротких слов, ритмичный слоган, перечисление ценностей
«под бит». Для одного заголовка — `gradient-text-sweep`; для списка с
пояснениями — шаблоны списков.

## Фразы из озвучки

- «делай то, что действительно важно, — сейчас»
- «быстро, просто, надёжно»
- «три слова, которые описывают нашу команду»

## Визуальный стиль

Тёмно-синий `#050818`, светлый текст `#ecfeff`, акцент `#22d3ee` на
последнем слове; капс weight 800, высота строки 15.5 % кадра. Системный
стек `-apple-system, "Segoe UI", Roboto, sans-serif`. 1920×1080,
120 кадров (4 с), 30 fps.

## Входные данные

`KineticWordStackProps`: `backgroundColor` (`#050818`), `accentColor`
(`#22d3ee`), `textColor` (`#ecfeff`), `words: string[]` («BUILD», «WHAT»,
«MATTERS», «NOW»). Слова переводятся в верхний регистр.

## Анимации

Каждое слово: старт `6 + i·11` кадров, `spring` (damping 13, stiffness
170, mass 0.7) → translateY −1.1 строки→0, scale 1.18→1, opacity; вспышка
`textShadow` 16→30 кадр от старта. После последнего — `spring` ореола и
линии.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/kinetic-word-stack/KineticWordStack.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `spring`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`. Больше ~6 слов не влезут по высоте (строка = 15.5 % кадра);
затухание привязано к `DURATION_FRAMES = 120`.

## Паттерны

`key-point-emphasis`, `sequence-steps`
