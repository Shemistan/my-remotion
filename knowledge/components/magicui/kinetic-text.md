# KineticText — `magicui/kinetic-text`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Тонкий заголовок (weight 300), в котором буква под курсором
«набухает» до 900 с обводкой, а соседние — до 600 и 400: волна
насыщенности шрифта.

## Когда использовать

В видео — как «бегущая волна» жирности по слову: акцент на названии,
ощущение «живой» типографики. Сам по себе эффект рассчитан на hover;
без переработки даёт только статичный тонкий текст.

## Фразы из озвучки

- «слово, которое оживает»
- «каждая буква имеет значение»
- «почувствуйте ритм»

## Визуальный стиль

Variable-font типографика: 300 → 900, обводка `1em·125/6000`, плавный
переход 0.4 с. Минималистичный, дизайнерский.

## Входные данные

- `text: string` (обязателен), `as?` = `"h1"` (`h1…h6|p|span`)
- `className?`, `style?` (CSS-переменные `--hover-padding`,
  `--text-stroke-width` можно переопределить), прочие атрибуты.

## Анимации

Только CSS: `hover:font-[900]`, `has-[+span:hover]`/`[:hover+&]` для
соседей, `transition: font-weight 0.4s, -webkit-text-stroke-color
0.4s, padding 0.4s`. JS-анимации нет.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/kinetic-text.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/kinetic-text.mdx` — документация

## Зависимости

Tailwind v4 (arbitrary variants `has-[…]`), шрифт с переменной осью
weight (компонент шрифт не задаёт).

## Совместимость и адаптация

`adaptable`. Заменить hover на «активный индекс» из кадра:
`c = interpolate(frame, [0, D], [-1, n])`, для буквы `i` вес
`900 - 300·min(|i-c|, 2)` (≥300), обводка/padding так же; убрать
`transition`. Нужен variable font (например, через
`@remotion/google-fonts`).

## Паттерны

`key-point-emphasis`, `abstract-concepts`
