# AnimatedGradientText — `magicui/animated-gradient-text`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Текст с двухцветным градиентом (оранжевый → фиолетовый → оранжевый),
который бесконечно бежит вдоль строки.

## Когда использовать

Акцентное слово или короткая фраза в заголовке, бейдж «Introducing…».
Для многоцветного «живого» эффекта — `aurora-text`.

## Фразы из озвучки

- «знакомьтесь — новая функция»
- «это меняет правила игры»
- «главное — скорость»

## Визуальный стиль

Двухцветный линейный градиент, ровный линейный темп (8 с), чистая
современная типографика.

## Входные данные

- `speed?: number` = `1` (→ `--bg-size: speed·300%`)
- `colorFrom?` = `"#ffaa40"`, `colorTo?` = `"#9c40ff"`
- `children`, `className`, атрибуты `div`/`span`.

## Анимации

`animate-gradient` → `@keyframes gradient { to { background-position:
var(--bg-size, 300%) 0 } }`, `8s linear infinite`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/animated-gradient-text.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/registry/registry-ui.ts` — `@keyframes gradient`
- `templates/react-libriry/magicui/apps/www/content/docs/components/animated-gradient-text.mdx` — документация

## Зависимости

Tailwind v4 (`bg-linear-to-r`, `from-(--…)`), `cn`.

## Совместимость и адаптация

`adaptable`. `backgroundPosition: \`${(frame/fps % 8)/8 · bgSize}% 0\``
inline вместо класса, или отрицательный `animationDelay` + `paused`.

## Паттерны

`key-point-emphasis`
