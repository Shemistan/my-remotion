# DiagonalLines — `animata/diagonal-lines`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Статичный фон из тонких диагональных (45°) линий-штриховки поверх
`bg-background`.

## Когда использовать

Нейтральная подложка «чертёж, черновик, в разработке», фон под
карточки/скриншоты. Соседи: `animata/grid` (клетка), `animata/dot`
(точки), `animata/zigzag`.

## Фразы из озвучки

- «пока это только черновик»
- «работа ещё в процессе»
- «давайте набросаем схему»

## Визуальный стиль

Серые линии 1px (`#cacaca`), шаг 10px; минималистично, технично.

## Входные данные

`color = "#cacaca"`, `spacing = 10` (px), `children?` (без них — плашка
«This has diagonal line background»), `className?`.

## Анимации

Нет: `repeating-linear-gradient(45deg, …)` + `backgroundSize`.

## Исходники и документация

- `templates/react-libriry/animata/animata/background/diagonal-lines.tsx` — компонент
- `templates/react-libriry/animata/content/docs/background/diagonal-lines.mdx` — документация
- `templates/react-libriry/animata/animata/background/diagonal-lines.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`); класс `bg-background` из темы (CSS-переменная
`--background`).

## Совместимость и адаптация

`adaptable` без доработки: чистый CSS-фон, рендерится одинаково на каждом
кадре. Для движения — `backgroundPosition` из `frame` (линии «ползут»).
Задать `--background` или заменить класс на явный цвет.

## Паттерны

`abstract-concepts`
