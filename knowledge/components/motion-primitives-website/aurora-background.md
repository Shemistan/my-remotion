# AuroraBackground — `motion-primitives-website/aurora-background`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Тёмный фон с размытыми сине-фиолетовыми полосами северного сияния,
медленно дрейфующими; радиальная маска из правого верхнего угла.

## Когда использовать

Фон для интро, заголовка, цитаты; «атмосферная», спокойная сцена;
технологичный премиальный тон (Aceternity-стиль).

## Фразы из озвучки

- «добро пожаловать»
- «представьте себе будущее»
- «начнём с главного»

## Визуальный стиль

`bg-zinc-950`; `repeating-linear-gradient(100deg, blue-500, indigo-300,
blue-300, violet-200, blue-400)`, `blur-[10px]`, `opacity-50`,
`mix-blend-difference`; цикл 60 с.

## Входные данные

`AuroraBackgroundProps`: `children?`; `showRadialGradient?` (true);
`className?`. Использует CSS-переменные цветов (`--blue-500` и др.),
которые создаёт плагин `addVariablesForColors` в `tailwind.config.ts`.

## Анимации

`after:animate-aurora` — keyframes `aurora` (`background-position 50% →
350%`, 60 с, linear, infinite), `background-attachment: fixed`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/aurora.tsx` — компонент
- `templates/react-libriry/motion-primitives-website/tailwind.config.ts` — keyframes `aurora`, плагин цветовых переменных
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Aurora Background»

## Зависимости

`tailwindcss` 3 (arbitrary properties, плагин переменных), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: анимирован только `::after` через keyframes — проще
переписать слой без псевдоэлемента: отдельный `div` с теми же
градиентами и `backgroundPosition: \`${50 + 300*(frame/(60*fps))}% 50%\``.
Либо оставить keyframes и задать `animationDelay: -frame/fps s`,
`animationPlayState: paused` (для псевдоэлемента — через `<style>` с
переменной). CSS-переменные цветов задать явно.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
