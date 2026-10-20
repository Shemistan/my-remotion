# GlareHover — `magicui/glare-hover`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Обёртка, по содержимому которой (карточка, картинка, бейдж) проходит
диагональный световой блик, как по глянцу или стеклу.

## Когда использовать

В видео — «блеснуть» карточкой, кредиткой, логотипом, наградой в
момент упоминания. Исходно запускается hover'ом.

## Фразы из озвучки

- «новенькая, блестящая версия»
- «премиальная карта для клиентов»
- «наша награда года»

## Визуальный стиль

Полоса `rgba(255,255,255,0.5)` под углом −45°, размер 250 %, проход
650 мс ease-in-out; фон обёртки `#000`.

## Входные данные

- `width?`, `height?` (CSS), `background?` = `"#000"`
- `color?: \`#${string}\`` = `"#ffffff"`, `opacity?` = `0.5`
- `angle?` = `-45`, `size?` = `250` (%), `duration?` = `650` (мс)
- `playOnce?` = `false`, `children`, `className`, `style`, атрибуты `div`.

## Анимации

`::before` с `linear-gradient(var(--gh-angle), transparent 60%,
rgba 70%, transparent)`; `background-position: -100% -100%` →
`100% 100%` на `:hover` через CSS `transition`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/glare-hover.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/glare-hover.mdx` — документация

## Зависимости

Tailwind v4 (`before:*`), `cn`.

## Совместимость и адаптация

`adaptable`. Заменить `::before` явным `div` с тем же градиентом и
`backgroundPosition: \`${-100 + 200p}% ${-100 + 200p}%\``, где `p =
interpolate(frame, [s, s + 0.65·fps], [0, 1], easing inOut, clamp)`;
hover и `transition` убрать.

## Паттерны

`key-point-emphasis`
