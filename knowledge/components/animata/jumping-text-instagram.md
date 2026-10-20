# JumpingTextInstagram — `animata/jumping-text-instagram`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Слова (или буквы) «запрыгивают» на место: снизу на 30px, с поворотом −30°,
пружиной с перелётом — как текст в сторис Instagram.

## Когда использовать

Соцсети, развлекательный контент, весёлые заголовки, анонсы.

## Фразы из озвучки

- «смотрите, что у нас нового»
- «это просто бомба»
- «подписывайтесь!»

## Визуальный стиль

Игривый, пружинистый; stagger 50 мс по словам / 10 мс по буквам.

## Входные данные

`text: string` (по умолчанию `"This is a jumping text effect"`), `mode?:
"word" | "character"` (`"word"`), `className?`.

## Анимации

`motion.span` на каждый узел: `initial {y 30, rotate −30, opacity 0}` →
`animate {y 0, rotate 0, opacity 1}`, `type: "spring", damping 10, mass 2`,
`delay: (word ? 0.05 : 0.01) * index`. Разбиение — `split(/(?:\b)/u)` или
посимвольно.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/jumping-text-instagram.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/jumping-text-instagram.mdx` — документация
- `templates/react-libriry/animata/animata/text/jumping-text-instagram.stories.tsx` — пример

## Зависимости

`motion`.

## Совместимость и адаптация

Анимация только на входе → `spring({frame: frame - i*delayFrames, fps,
config: {damping: 10, mass: 2}})` из remotion; из прогресса — y, rotate,
opacity. Для кириллицы `\b` в JS не работает с не-ASCII — делить по
пробелам.

## Паттерны

`key-point-emphasis`, `sequence-steps`
