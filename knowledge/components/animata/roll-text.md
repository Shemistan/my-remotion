# RollText — `animata/roll-text`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `user-events`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Надпись «прокручивается» как барабан: каждая единица (целиком, слово или
буква) уезжает вверх, а снизу приходит её копия; со stagger по буквам —
волна.

## Когда использовать

Навигационные лейблы, кнопки, «переворот» слова; в видео — короткий
акцент на слове, волна по буквам. Hover-анимацию воспроизвести по кадру.

## Фразы из озвучки

- «переключаемся»
- «прокрутим дальше»
- «следующий пункт меню»

## Визуальный стиль

Аккуратный UI-моушн, 250 мс на юнит, `cubic-bezier(0.77,0,0.175,1)`.

## Входные данные

`RollTextProps` (+ атрибуты `span`): `text: string`, `groupHover?` (false —
запуск по hover ближайшего `[data-roll-group]`/`.group/roll`), `disabled?`
(false), `stagger?: "none" | "word" | "character"` (`"none"`), `staggerMs?`
(32), `durationMs?` (250).

## Анимации

`roll-text.css`: `@keyframes roll-stack-open` (`translateY(0 → −50%)` у
стека из двух строк), `--roll-delay = index*staggerMs`; фазы
`closed/animating/open` в state; повтор через двойной `requestAnimationFrame`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/roll-text.tsx` — компонент
- `templates/react-libriry/animata/animata/text/roll-text.css` — keyframes
- `templates/react-libriry/animata/content/docs/text/roll-text.mdx` — документация
- `templates/react-libriry/animata/animata/text/roll-text.stories.tsx` — пример

## Зависимости

`react`, `@/lib/utils`, co-located CSS.

## Совместимость и адаптация

Убрать обработчики и фазы; для юнита i `translateY = −50% *
ease(clamp((ms − i*staggerMs)/durationMs))`. Остальная разметка (sizer +
clip) остаётся. `window.matchMedia` убрать.

## Паттерны

`transformation`, `key-point-emphasis`
