# Bento Four — `animata/bento-four`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | example |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Каркас bento-раскладки из 4 цветных плашек-заглушек на сетке 3×3: широкая
синяя (2 колонки), зелёная, высокая серая (2 строки), большая красная
(2×2). Подписи-плейсхолдеры: Grocery List, Meal Planner, Something Cool,
Another Thing.

## Когда использовать

Шаблон-раскладка, куда подставляются свои карточки/виджеты: «четыре
блока, один главный». Соседние раскладки: `animata/bento-five`,
`animata/bento-six`.

## Фразы из озвучки

- «четыре направления, одно главное»
- «вот как устроен наш продукт»
- «каждый блок отвечает за своё»

## Визуальный стиль

Плоские пастельные цвета blue/green/zinc/red-300, rounded-2xl, gap-3,
текст без оформления.

## Входные данные

Без props; разметка — `BentoCard({children, className})` внутри файла.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/bento-grid/four.tsx` — раскладка
- `templates/react-libriry/animata/content/docs/bento-grid/four.mdx` — документация
- `templates/react-libriry/animata/animata/bento-grid/four.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`), Tailwind grid-утилиты.

## Совместимость и адаптация

`adaptable`: статичная CSS-grid. Подставить свой контент в ячейки,
появление — stagger (`interpolate(frame - i*6, …)` на opacity/scale).
Сетка завязана на брейкпоинт `sm:` — в Remotion ширина кадра обычно
больше 640px, раскладка будет многоколоночной.

## Паттерны

`system-structure`, `comparison`
