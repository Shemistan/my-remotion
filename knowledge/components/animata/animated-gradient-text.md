# AnimatedGradientText — `animata/animated-gradient-text`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Текст, залитый переливающимся градиентом (жёлтый → тёмно-жёлтый → розовый),
который бесконечно «едет» туда-обратно внутри букв.

## Когда использовать

Акцент на названии продукта, ключевом слове, цене, бейдже. Не для длинного
текста.

## Фразы из озвучки

- «и главное слово здесь — …»
- «наш флагман»
- «особое предложение»

## Визуальный стиль

Яркий маркетинговый акцент; цикл 3 с, `alternate`.

## Входные данные

`React.HTMLAttributes<HTMLDivElement>`: `className?`, `children`. Цвета зашиты
в классы: `bg-linear-to-r from-yellow-500 from-30% via-yellow-700 via-50%
to-pink-500 to-80% bg-size-[200%_auto] bg-clip-text text-transparent`.

## Анимации

`animate-bg-position` = `bg-position 3s infinite alternate` (keyframes
`background-position 0% 50% → 100% 50%` в `styles/globals.css`).

## Исходники и документация

- `templates/react-libriry/animata/animata/text/animated-gradient-text.tsx` — компонент
- `templates/react-libriry/animata/styles/globals.css` — `--animate-bg-position`, `@keyframes bg-position`
- `templates/react-libriry/animata/content/docs/text/animated-gradient-text.mdx` — документация
- `templates/react-libriry/animata/animata/text/animated-gradient-text.stories.tsx` — пример

## Зависимости

Tailwind v4, `@/lib/utils`.

## Совместимость и адаптация

Убрать `animate-bg-position`, задать `backgroundPosition` из кадра:
`p = (frame/fps % 6)/3; x = p<=1 ? p*100 : (2-p)*100` → `${x}% 50%`. Либо
оставить keyframes с `animationDelay: -frame/fps+'s'` и `animationPlayState:
'paused'`.

## Паттерны

`key-point-emphasis`
