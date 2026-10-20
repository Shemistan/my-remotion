# TextShimmer — `motion-primitives/text-shimmer`

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

Серый текст, по которому бесконечно пробегает светлый блик (градиент,
обрезанный по форме букв через `bg-clip-text`).

## Когда использовать

Статус «идёт обработка / думает / генерирует», подпись под
логотипом, лёгкое привлечение внимания к строке, которая стоит на экране
долго. Для входа текста — `text-effect`.

## Фразы из озвучки

- «модель обдумывает ответ»
- «идёт генерация отчёта»
- «загрузка данных…»

## Визуальный стиль

Монохромный: CSS-переменные `--base-color` (#a1a1aa / dark #71717a) и
`--base-gradient-color` (#000 / dark #fff); ширина блика
`--spread = длина строки * spread` px.

## Входные данные

`TextShimmerProps`: `children: string`; `as?` (`'p'`); `duration?`
(2, с на проход); `spread?` (2); `className?`.

## Анимации

motion: `backgroundPosition '100% center' → '0% center'`,
`repeat: Infinity`, `ease: 'linear'`, `duration`.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/text-shimmer.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/text-shimmer/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/text-shimmer/text-shimmer-basic.tsx` — пример

## Зависимости

`motion` (`motion.create`), `@/lib/utils` (`cn`), Tailwind 4 (arbitrary
properties `[--bg:…]`).

## Совместимость и адаптация

`adaptable`: бесконечный цикл motion заменить на
`backgroundPosition: \`${100 - ((frame % (duration*fps)) / (duration*fps))*100}% center\``
в inline-style; `motion.create` → обычный тег. Tailwind-классы с
переменными перенести в style, если в проекте Remotion нет Tailwind 4.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
