# HeroTitle — `remotion-boilerplate/hero-title`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-boilerplate` (`templates/remotion-components/remotion-boilerplate`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | UNLICENSED (package.json, README); файла LICENSE нет — только референс идей |

## Что визуализирует

Крупный заголовок целиком влетает слева (−200 px) с разворотом из −90° и
проявлением.

## Когда использовать

Референс «дерзкого» входа заголовка. README называет его «word cascade», но
код анимирует строку целиком (`split: "none"`).

## Фразы из озвучки

- «встречайте!»
- «главная новость дня»
- «и вот он — результат»

## Визуальный стиль

96 px, 800, `SF Pro Display, SF Pro Text, Helvetica, Arial`, цвет
`COLOR_1 #86A8E7`, межбуквенный −0.02em.

## Входные данные

`HeroTitleProps`: `text: string`, `fontSize?` (96), `color?` (`COLOR_1`);
объявлены, но **не используются**: `startFrame`, `durationInFrames`,
`staggerPerChar`, `yDistance`.

## Анимации

`AnimatedText` (`remotion-bits`): `split: "none"`, `frames: [0, 20]`
(жёстко), opacity 0→1, x −200→0, rotate −90→0, `easeOutQuart`.

## Исходники и документация

- `templates/remotion-components/remotion-boilerplate/src/components/text/HeroTitle.tsx`
- `templates/remotion-components/remotion-boilerplate/src/HeroTitle.tsx` — реэкспорт

## Зависимости

`remotion`, `remotion-bits`; `src/styles/constants.ts`.

## Совместимость и адаптация

`native`. Тайминг не настраивается через props (frames зашиты).
UNLICENSED: без явной лицензии переиспользование кода юридически не
разрешено — только как референс идей.

## Паттерны

`key-point-emphasis`
