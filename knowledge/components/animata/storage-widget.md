# StorageWidget — `animata/storage-widget`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Тёмный виджет 208×208 «5.31 / 16 GB, 28%»: под заголовком — сетка 15×7
маленьких квадратиков (как GitHub-контрибуции), окрашенных по категориям
(фиолетовые 42, розовые 12, синие 19, остальные серые), снизу легенда
5.90 | 2.15 | 2.59 GB.

## Когда использовать

Заполненность хранилища/квоты, «использовано 28%», доли категорий в
сетке-мозаике.

## Фразы из озвучки

- «использовано чуть больше пяти гигабайт»
- «почти треть хранилища уже занята»
- «каждая клетка — часть ваших данных»

## Визуальный стиль

zinc-800, клетки 8px purple/pink/blue-400 и gray-600, белая крупная
цифра; dashboard-эстетика.

## Входные данные

Без props: размеры `columns = 7`, `rows = 15` и пороги категорий зашиты.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/storage-widget.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/storage-widget.mdx` — документация
- `templates/react-libriry/animata/animata/widget/storage-widget.stories.tsx` — пример

## Зависимости

`lucide-react`.

## Совместимость и адаптация

`adaptable`: клетки «заполняются» по порядку (`index < frame*k` →
цвет категории, иначе серый); пороги и легенду вынести в props.

## Паттерны

`quantities`, `growth-decline`
