# UnderlineHoverText — `animata/underline-hover-text`

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

Слово над тусклой базовой линией; по hover текст приподнимается на 2px,
а от центра наружу «разливается» скруглённая черта 3px.

## Когда использовать

Акцент на слове-ссылке, термине; в видео — подчёркивание из центра на
ключевое слово. Hover-анимацию воспроизвести по кадру.

## Фразы из озвучки

- «главное слово — доверие»
- «запомните термин»
- «вот что важно»

## Визуальный стиль

Сдержанный, `text-2xl font-medium`, 500 мс `cubic-bezier(0.22,1,0.36,1)`.

## Входные данные

`UnderlineHoverTextProps`: `text: string`, `textColor?` (`"text-zinc-900
dark:text-zinc-100"`), `hoverTextColor?` (`""`), `hoverColor?` (`"bg-zinc-900
dark:bg-zinc-100"` — класс цвета черты), `fontSize?` (`"text-2xl"`),
`fontWeight?` (`"font-medium"`), `className?`.

## Анимации

`transition-[width] duration-500` черты `w-0 → w-full` от центра;
`transition-transform` текста `−translate-y-[2px]`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/underline-hover-text.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/underline-hover-text.mdx` — документация
- `templates/react-libriry/animata/animata/text/underline-hover-text.stories.tsx` — пример

## Зависимости

Tailwind, `@/lib/utils`.

## Совместимость и адаптация

`width = interpolate(p, [0,1], [0, 100])%` и `translateY = −2p` px, где `p`
— прогресс из кадра с `Easing.bezier(0.22,1,0.36,1)`.

## Паттерны

`key-point-emphasis`
