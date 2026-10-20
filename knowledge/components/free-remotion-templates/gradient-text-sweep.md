# Gradient Sweep Title — `free-remotion-templates/gradient-text-sweep`

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

Заголовок капсом мягко влетает (масштаб+подъём), по буквам циклично
проходит яркая полоса градиента акцентного цвета; под ним прорисовывается
светящаяся линия и всплывает подстрочник.

## Когда использовать

Слоган, название продукта, «премиальный» титр в техно-стилистике. Для
пословного удара — `kinetic-word-stack`; для глитча — `glitch-text`.

## Фразы из озвучки

- «создавай смело»
- «новый уровень качества»
- «это наш главный слоган»

## Визуальный стиль

Тёмно-синий `#050818`, бирюзовый акцент `#22d3ee`, светлый текст
`#ecfeff`, weight 800, мягкое свечение `textShadow`, радиальный ореол.
Размер шрифта ~15.5 % высоты, ужимается для длинных строк. Системный стек
`-apple-system, "Segoe UI", Roboto, sans-serif`. 1920×1080, 110 кадров
(3.67 с), 30 fps.

## Входные данные

`GradientTextSweepProps`: `backgroundColor` (`#050818`), `accentColor`
(`#22d3ee`), `textColor` (`#ecfeff`), `headline` («BUILD BOLD»),
`subline` («ACME INC.»). Оба текста переводятся в верхний регистр.

## Анимации

`spring` с 4 кадра: scale 0.86→1, opacity, translateY. Блик —
`linear-gradient` с `backgroundClip: text`, позиция полосы
`interpolate((frame−14) % 56)` −20 %→120 % (цикл 56 кадров). Линия —
`spring` с 22 кадра (ширина), подстрочник — `spring` с 30.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/gradient-text-sweep/GradientTextSweep.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`interpolate`, `spring`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`. Затухание привязано к константе `DURATION_FRAMES = 110`, а не к
длине композиции — при смене длительности поправить.

## Паттерны

`key-point-emphasis`
