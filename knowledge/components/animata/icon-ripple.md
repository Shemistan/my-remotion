# IconRipple — `animata/icon-ripple`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `icons-shapes` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Иконка (по умолчанию микрофон) с расходящимся круговым «пингом» —
кольцо увеличивается и гаснет, бесконечно.

## Когда использовать

«Идёт запись», «слушаем вас», «сигнал/уведомление», голосовой ассистент,
точка на карте «вы здесь».

## Фразы из озвучки

- «просто скажите, что нужно»
- «идёт запись»
- «сигнал получен»

## Визуальный стиль

Светло-серые иконка и кольцо `#ddd` по умолчанию, рамка 2px,
минимализм.

## Входные данные

`icon: ElementType = Mic` (lucide), `iconSize = 24`, `iconColor = "#ddd"`,
`borderColor = "#ddd"`, `inset = "10px"` (отступ кольца).

## Анимации

Tailwind `animate-ping` (встроенный keyframes `ping`: scale 2, opacity 0,
1 с, cubic-bezier, infinite) на кольце.

## Исходники и документация

- `templates/react-libriry/animata/animata/icon/icon-ripple.tsx` — компонент
- `templates/react-libriry/animata/content/docs/icon/icon-ripple.mdx` — документация
- `templates/react-libriry/animata/animata/icon/icon-ripple.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: вместо `animate-ping` — `t = (frame % fps) / fps`,
`transform: scale(${1 + t})`, `opacity: 1 - t`; для нескольких волн —
несколько колец со сдвигом фазы.

## Паттерны

`key-point-emphasis`, `cause-effect`
