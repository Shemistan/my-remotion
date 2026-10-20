# FlipCard — `animata/flip-card`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Карточка 224×288 с двумя гранями: по hover переворачивается на 180° по оси
Y (или X) и показывает обратную сторону. Содержимое граней — любые
`children`.

## Когда использовать

«Вопрос — ответ», «миф — факт», «до — после», раскрытие скрытого. Переворот
воспроизвести по кадру.

## Фразы из озвучки

- «а теперь обратная сторона»
- «миф или правда?»
- «переворачиваем карту»

## Визуальный стиль

Нейтральный 3D, `perspective 1000px`, 500 мс `ease-out`.

## Входные данные

Составной API: `FlipCard` (`rotate?: "x" | "y"` (`"y"`), `className?`,
атрибуты `div`), `FlipCard.Front`, `FlipCard.Back` (атрибуты `div`, обе
`absolute inset-0 backface-hidden`, Back заранее повёрнута на 180°).

## Анимации

`transition-transform duration-500 ease-out transform-3d` +
`group-hover/card:rotate-y-180` (или `rotate-x-180`).

## Исходники и документация

- `templates/react-libriry/animata/animata/card/flip-card.tsx` — компонент
- `templates/react-libriry/animata/content/docs/card/flip-card.mdx` — документация
- `templates/react-libriry/animata/animata/card/flip-card.stories.tsx` — пример

## Зависимости

`react` (`createContext`, `use`), Tailwind v4 (3D-утилиты), `@/lib/utils`.

## Совместимость и адаптация

Внутреннему контейнеру inline `transform: rotateY(${180·p}deg)`, `p` из кадра
(`spring` или `interpolate`); убрать hover-класс. `backface-visibility`
работает в headless Chrome.

## Паттерны

`comparison`, `transformation`
