# SwapText — `animata/swap-text`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Две надписи в «окне»: начальная уезжает вверх, снизу на её место
поднимается финальная (медленно, 1000 мс, `ease-slow`).

## Когда использовать

«Было → стало», замена понятия, антоним, «Открыть/Закрыть». Hover/click
воспроизвести по кадру.

## Фразы из озвучки

- «было сложно — стало просто»
- «вместо этого — вот это»
- «меняем подход»

## Визуальный стиль

`text-3xl font-bold`, без фона, `overflow-hidden`.

## Входные данные

`SwapTextProps` (+ атрибуты `div`): `initialText: string`, `finalText:
string`, `supportsHover?` (true), `disableClick?`, `textClassName?`,
`initialTextClassName?`, `finalTextClassName?`, `className?`.

## Анимации

`transition-transform duration-1000 ease-slow`: обе строки
`-translate-y-full` при `active` (click) или `group-hover/swap`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/swap-text.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/swap-text.mdx` — документация
- `templates/react-libriry/animata/animata/text/swap-text.stories.tsx` — пример

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

Прогресс `p` из кадра с `Easing.bezier(0.405,0,0.025,1)`; обеим строкам
`translateY(−p·100%)`. Кнопку заменить на `div`.

## Паттерны

`transformation`, `comparison`
