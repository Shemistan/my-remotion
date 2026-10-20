# AvatarCircles — `magicui/avatar-circles`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Ряд перекрывающихся круглых аватаров с белой обводкой и финальным
кружком «+N» — «к нам уже присоединились».

## Когда использовать

Социальное доказательство и команда: «уже 10 000 пользователей»,
«над проектом работают», участники события. В связке с
`number-ticker` для числа.

## Фразы из озвучки

- «к нам уже присоединились тысячи людей»
- «над проектом работает целая команда»
- «вы будете не один»

## Визуальный стиль

Аватары 40 px (`h-10 w-10`), перекрытие `-space-x-4`, бордер 2 px
белый (dark `gray-800`); кружок «+N» чёрный/белый, `text-xs`.

## Входные данные

- `avatarUrls: {imageUrl: string, profileUrl: string}[]` (обязателен)
- `numPeople?: number` — число в «+N» (не показывается, если 0/нет)
- `className?`

## Анимации

Нет (статичная разметка `a > img`).

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/avatar-circles.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/avatar-circles.mdx` — документация

## Зависимости

React, `cn`.

## Совместимость и адаптация

`adaptable`, адаптации минимальны: `<img>` → `<Img src={staticFile(…)}>`
(ждёт загрузку), ссылки не нужны. Появление по одному — stagger по
кадру (scale/translateX), «+N» докрутить счётчиком.

## Паттерны

`quantities`, `relationships`
