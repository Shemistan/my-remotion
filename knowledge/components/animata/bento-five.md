# Bento Five — `animata/bento-five`

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

Каркас bento из 5 плашек на сетке 3×3: широкая жёлтая сверху, высокая
зелёная колонка справа на все 3 строки, красная на 2 строки, фиолетовая и
серая «Add Widget». Подписи-плейсхолдеры.

## Когда использовать

Раскладка «один вертикальный главный блок + четыре второстепенных».
Соседи: `animata/bento-four`, `animata/bento-six`.

## Фразы из озвучки

- «пять ключевых модулей»
- «а справа — то, ради чего всё затевалось»
- «добавляйте свои блоки»

## Визуальный стиль

Пастельные yellow/green/red/purple/zinc-300, rounded-2xl, gap-3.

## Входные данные

Без props. Ширина контейнера `min-w-[90cqw]` (container query units —
нужен родитель с `container-type`, иначе ширина от viewport).

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/bento-grid/five.tsx` — раскладка
- `templates/react-libriry/animata/content/docs/bento-grid/five.mdx` — документация
- `templates/react-libriry/animata/animata/bento-grid/five.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: статичная сетка; контент — свой, вход — stagger по кадру.
Заменить `min-w-[90cqw]` на явную ширину.

## Паттерны

`system-structure`, `key-point-emphasis`
