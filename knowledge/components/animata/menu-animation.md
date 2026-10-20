# MenuAnimation — `animata/menu-animation`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Вертикальный список крупных моно-заголовков; у пункта под курсором слева
выезжает синяя стрелка, текст сдвигается вправо и окрашивается в
blue-500.

## Когда использовать

Оглавление/план ролика с подсветкой текущего пункта: «сначала…, затем…».
Без интеракции — подсвечивать пункт по кадру.

## Фразы из озвучки

- «вот план на сегодня»
- «переходим ко второму пункту»
- «и последний раздел»

## Визуальный стиль

`font-mono font-semibold`, md:text-4xl, чёрный (dark: белый) текст,
акцент blue-500, переход 300 мс ease-out.

## Входные данные

`menuItems: string[]` (обязателен).

## Анимации

Hover `group-hover/menu`: стрелка `-translate-x-full opacity-0 →
translate-x-0 opacity-100`, текст `-translate-x-6 (md: -12) → 0`,
`transition-all/transform duration-300`.

## Исходники и документация

- `templates/react-libriry/animata/animata/list/menu-animation.tsx` — компонент
- `templates/react-libriry/animata/content/docs/list/menu-animation.mdx` — документация
- `templates/react-libriry/animata/animata/list/menu-animation.stories.tsx` — пример

## Зависимости

`lucide-react` (`ArrowRight`).

## Совместимость и адаптация

`adaptable`: добавить prop `activeIndex` (из кадра или `Sequence`),
вместо `group-hover` — inline translate/opacity/color, интерполированные
по `frame - activationFrame` (≈9 кадров при 30 fps).

## Паттерны

`sequence-steps`, `key-point-emphasis`
