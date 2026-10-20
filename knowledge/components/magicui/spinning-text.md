# SpinningText — `magicui/spinning-text`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Текст, расставленный по кругу, как надпись на печати или бейдже, и
медленно вращающийся вокруг центра.

## Когда использовать

Бейдж-стикер «new • limited • 2026 •», круговая подпись вокруг логотипа
или иконки, «вечный цикл». Для движения по орбите элементов —
`orbiting-circles`.

## Фразы из озвучки

- «и так по кругу, снова и снова»
- «бесконечный цикл улучшений»
- «официально и проверено»

## Визуальный стиль

Буквы равномерно по окружности радиуса `radius` ch; ровное линейное
вращение (10 с на оборот), стиль стикера/штампа.

## Входные данные

- `children: string | string[]` (обязателен; массив склеивается)
- `duration?` = `10` (с на оборот); `reverse?` = `false`
- `radius?` = `5` (в `ch`)
- `transition?: Transition`, `variants?: {container?, item?}`
- `className`, `style`.

## Анимации

Контейнер `motion.div` variants `visible: { rotate: ±360 }`,
`transition { repeat: Infinity, ease: "linear", duration }`. Позиции
букв — статичный CSS `rotate(360deg/total·index) translateY(-radius ch)`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/spinning-text.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/spinning-text.mdx` — документация

## Зависимости

`motion` (`motion.div`, `motion.span`), `cn`.

## Совместимость и адаптация

`adaptable`. Заменить `motion.div` на `div` с
`transform: rotate(${(reverse?-1:1)·360·(frame/fps)/duration}deg)`;
раскладка букв не меняется.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
