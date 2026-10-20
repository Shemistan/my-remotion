# AvatarList — `animata/avatar-list`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition`, `css-animation`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md); фото по умолчанию — Unsplash |

## Что визуализирует

Ряд круглых аватаров внахлёст (−ml-3); при наведении аватар
увеличивается, поверх появляется тултип с именем и должностью.

## Когда использовать

«Команда», «пользователи уже с нами», соц-доказательство рядом с цифрой.
Используется в `animata/bento-eight`.

## Фразы из озвучки

- «к нам присоединились тысячи людей»
- «познакомьтесь с командой»
- «над проектом работают шесть специалистов»

## Визуальный стиль

Круглые фото на белом, лёгкий переливающийся фон при hover, тёмный
тултип slate-900; компактно.

## Входные данные

`size: "sm" | "md" | "lg" = "md"` (sm 32px, md 48px; `lg` по коду
`size-6` = 24px — меньше md), `className?`, `items?: {name, position,
image}[]` (по умолчанию 6 человек с Unsplash).

## Анимации

Hover: `scale-110` (transition 200 мс), тултип opacity/translate (300 мс),
`animate-bg-position` на подложке.

## Исходники и документация

- `templates/react-libriry/animata/animata/list/avatar-list.tsx` — компонент
- `templates/react-libriry/animata/content/docs/list/avatar-list.mdx` — документация
- `templates/react-libriry/animata/animata/list/avatar-list.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: статичный ряд. Для видео — аватары «въезжают» по очереди
(translateX/opacity по кадру), тултип показывать для активного индекса по
кадру. Фото — локально через `staticFile`.

## Паттерны

`quantities`, `relationships`
