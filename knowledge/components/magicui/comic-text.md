# ComicText — `magicui/comic-text`

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

Надпись в стиле комикса: жёлтые буквы в красный растровый горошек,
толстая чёрная обводка, наклон, двойная тень; влетает с пружинным
увеличением.

## Когда использовать

Звукоподражания и восклицания («БАМ!», «ВАУ!», «ОПС»), юмор,
поп-арт-вставки. Не для серьёзного контекста.

## Фразы из озвучки

- «и тут — бам!»
- «вау, вот это результат»
- «ой, что-то пошло не так»

## Визуальный стиль

Поп-арт: `#FACC15` + точки `#EF4444`, обводка `fontSize·0.35px`,
`skewX(-10deg)`, uppercase, шрифт `'Bangers', 'Comic Sans MS',
'Impact'`. Энергичный.

## Входные данные

- `children: string` (обязателен, иначе `throw`)
- `fontSize?` = `5` (rem)
- `className?`, `style?` (мержится поверх)
Цвета зашиты константами `dotColor`, `backgroundColor`.

## Анимации

`motion.div`: `initial {opacity 0, scale 0.8, rotate -2}` →
`animate {opacity 1, scale 1, rotate 0}`, `type: "spring"`, `duration
0.6`. Один раз на монтировании.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/comic-text.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/comic-text.mdx` — документация

## Зависимости

`motion`, `cn`; шрифт Bangers не подключается в компоненте.

## Совместимость и адаптация

`adaptable`. Заменить вход на `spring({frame, fps})` из `remotion`
(scale 0.8→1, rotate −2→0, opacity). Шрифт Bangers подгрузить через
`@remotion/google-fonts/Bangers`, иначе будет fallback.

## Паттерны

`key-point-emphasis`, `cause-effect`
