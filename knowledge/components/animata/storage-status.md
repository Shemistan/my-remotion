# StorageStatus — `animata/storage-status`

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

Высокая чёрная колонка 128×384 — вертикальный «стек» диска 512 GB:
сегменты Free (серый, растягивается), System 50, Audio 80, Video 150 GB с
цветом и высотой по доле; справа от каждого — выноска-ярлык «N GB».

## Когда использовать

Состав целого из частей по объёму: «на что уходит место», бюджет,
распределение ресурсов. Для круговой доли — графики из среза graphs.

## Фразы из озвучки

- «больше всего места занимает видео»
- «свободно всего 232 гигабайта»
- «из чего складывается объём»

## Визуальный стиль

Чёрный контейнер, цветные rounded-md блоки slate/purple/orange-500,
ромбик-указатель и плашка-ярлык; инфографично.

## Входные данные

Без props: `total = 512`, массив `items` `{label, value, color,
stretch?}`; Free вычисляется как остаток.

## Анимации

Нет (`transition-all` на сегменте без триггера).

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/storage-status.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/storage-status.mdx` — документация
- `templates/react-libriry/animata/animata/widget/storage-status.stories.tsx` — пример

## Зависимости

`@/lib/utils`.

## Совместимость и адаптация

`adaptable`: вынести `total`/`items` в props; рост сегментов снизу вверх —
`height × progress` по кадру со stagger, ярлыки — fade-in. Ярлыки
выходят за правый край (`left-full`) — оставить место в кадре.

## Паттерны

`quantities`, `comparison`, `system-structure`
