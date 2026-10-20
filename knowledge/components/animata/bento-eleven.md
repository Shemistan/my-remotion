# Bento Eleven (Modern) — `animata/bento-eleven`

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

Каркас bento из 11 плашек на сетке 5×5 для «health»-приложения: Grocery
List, Meal Planner, Hydration Reminder, Travel Journal, Fitness Tracker,
крупный «healthOS», Snack suggestions, Nutrition Tracker, Task Manager,
Progress dashboard («Track goals with charts»), Find recipes.

## Когда использовать

Карта большого продукта/суперприложения, «всё для здоровья в одном».
Экспортируется как `Modern`.

## Фразы из озвучки

- «одно приложение вместо одиннадцати»
- «питание, спорт, сон — всё под контролем»
- «вот из чего состоит healthOS»

## Визуальный стиль

Пастельные blue/green/red/amber/zinc/purple/lime/yellow/orange/pink-300,
rounded-2xl, gap-2, плотная мозаика.

## Входные данные

Без props; подписи в разметке.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/bento-grid/eleven.tsx` — раскладка
- `templates/react-libriry/animata/content/docs/bento-grid/eleven.mdx` — документация
- `templates/react-libriry/animata/animata/bento-grid/eleven.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: статичная сетка 5×5; заменить подписи, вход stagger по кадру,
акцент на «healthOS» (scale/подсветка по кадру).

## Паттерны

`system-structure`, `relationships`
