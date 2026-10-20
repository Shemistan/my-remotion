# SpinningText — `motion-primitives/spinning-text`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Текст, расставленный по окружности (буквы повёрнуты к центру), который
непрерывно вращается — «бейдж-печать».

## Когда использовать

Бейдж вокруг логотипа/иконки/фото: «NEW • 2026 • NEW», «scroll down»,
«open source», декоративный элемент в углу кадра, циклы и повторение.

## Фразы из озвучки

- «процесс повторяется снова и снова»
- «новинка этого сезона»
- «круглосуточно, без выходных»

## Визуальный стиль

Буквы `absolute` по кругу; размер `fontSize` в rem (`--font-size`),
радиус `radius` в `ch`; `ease: 'linear'`, полный оборот за `duration`.

## Входные данные

`SpinningTextProps`: `children: string`; `duration?` (10, с на оборот);
`reverse?` (false); `fontSize?` (1, rem); `radius?` (5, ch);
`transition?`; `variants?: {container?, item?}`; `className?`, `style?`.

## Анимации

Контейнер `rotate 0 → ±360`, `repeat: Infinity`, linear; позиция буквы —
`rotate(360deg/total*index) translateY(-radius ch)` (статичная).

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/spinning-text.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/spinning-text/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/spinning-text/spinning-text-basic.tsx` — пример

## Зависимости

`motion` (`motion.div`, `motion.span`), `@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: раскладка букв — чистый CSS; вращение заменить на
`transform: rotate(${(reverse?-1:1) * 360 * frame / (duration*fps)}deg)`
на обычном `div`. Пользовательские `variants.item` (если используются)
переписать в interpolate.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
