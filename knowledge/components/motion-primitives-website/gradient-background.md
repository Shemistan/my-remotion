# GradientBackground — `motion-primitives-website/gradient-background`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Чёрный полноэкранный фон с тремя крупными размытыми цветными пятнами
(`gradient-blob`) в разных углах; пять цветовых пресетов.

## Когда использовать

Готовый атмосферный фон сцены: `aurora` — техно, `sunset` — тёплый,
`ocean` — спокойный, `forest` — эко, `neon` — яркий/молодёжный.

## Фразы из озвучки

- «тёплый летний вечер»
- «экологичный подход»
- «яркая, смелая идея»

## Визуальный стиль

`bg-black min-h-screen overflow-hidden`; 3 × `GradientBlob` размера `lg`
с парами цветов пресета; дети — `relative z-10`.

## Входные данные

`GradientBackgroundProps`: `children?`; `preset?: 'aurora'|'sunset'|
'ocean'|'forest'|'neon'` (`'aurora'`); `className?`.

## Анимации

Каждое пятно — анимация `gradient-blob` (20 с цикл, вращение/масштаб/
скругление).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/gradient-blur.tsx` — компонент

## Зависимости

`gradient-blob` (внутренний), `framer-motion`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: пятна по рецепту `gradient-blob`, со сдвигом фазы на пятно
(`t + i/3`), чтобы они не вращались синхронно; `min-h-screen` заменить
на `AbsoluteFill`.

## Паттерны

`abstract-concepts`
