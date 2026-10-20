# MirrorText — `animata/mirror-text`

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

Слово, повторённое четырьмя «срезами» по 12px высотой (как отражение/эхо);
по hover срезы со сдвигом по задержке смещаются в выбранную сторону.

## Когда использовать

Эффект эха, повтора, «отражения»; заголовок в стиле постера. Hover-анимацию
воспроизвести по кадру.

## Фразы из озвучки

- «история повторяется»
- «эхо прошлого»
- «отражение»

## Визуальный стиль

Тонкий uppercase `text-4xl font-light`, графичный.

## Входные данные

`text: string` (`"This is a text"`), `direction?: "up" | "down" | "left" |
"right"` (`"up"`), `className?`, `containerClassName?`.

## Анимации

`transition-transform duration-500 ease-slow` по `group-hover/mirror:` на
±16px (`translate-*-4`), задержки 200/100/75/0 мс у срезов.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/mirror-text.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/mirror-text.mdx` — документация
- `templates/react-libriry/animata/animata/text/mirror-text.stories.tsx` — пример

## Зависимости

Tailwind (токен `ease-slow` из `styles/globals.css`), `@/lib/utils`.

## Совместимость и адаптация

Прогресс по кадру для каждого среза со своей задержкой (6/3/2/0 кадров при
30 fps), сдвиг `interpolate(p,[0,1],[0,−16])` px; easing
`Easing.bezier(0.405,0,0.025,1)` (= `--ease-slow`).

## Паттерны

`abstract-concepts`, `key-point-emphasis`
