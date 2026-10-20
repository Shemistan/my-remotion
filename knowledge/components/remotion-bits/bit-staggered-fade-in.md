# Staggered Fade In Elements (bit) — `remotion-bits/bit-staggered-fade-in`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Пять цветных квадратов в ряд (синий, красный, зелёный, жёлтый,
фиолетовый) по очереди поднимаются снизу и проявляются.

## Когда использовать

Минимальная заготовка для «несколько пунктов по очереди»: варианты,
этапы, команды, цветовые категории. Заменить квадраты на карточки/иконки.
Для подписанного списка — `bit-list-reveal`.

## Фразы из озвучки

- «пять ключевых принципов»
- «один за другим появляются наши продукты»
- «шаг за шагом»

## Визуальный стиль

Тёмно-синий фон `#0f172a`, квадраты 150 px со скруглением 12 px, яркие
tailwind-цвета, gap 2rem; easeOutCubic, 90 кадров, 1920×1080.

## Входные данные

Без props: пять `div` с `boxStyle` и цветами; `transition = {opacity: [0,
1], y: [100, 0], duration: 30, stagger: 5, staggerDirection: "forward",
easing: "easeOutCubic"}`.

## Анимации

`StaggeredMotion`: каждый следующий элемент на 5 кадров позже, сдвиг y
100→0 и opacity 0→1 за 30 кадров.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/staggered-motion/StaggeredFadeIn.tsx` — сцена с `metadata` (отдельной mdx-страницы не найдено)

## Зависимости

`remotion` (`AbsoluteFill`); `remotion-bits`: `StaggeredMotion`.

## Совместимость и адаптация

`native`, размеры в px (не от viewport) — для других разрешений
пересчитать. Адаптации не нужны.

## Паттерны

`sequence-steps`, `comparison`, `quantities`
