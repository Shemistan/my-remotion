# HeroSection — `animata/hero-section`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | example |
| Категория | `layout-templates` |
| Совместимость с Remotion | complex |
| Флаги | `css-animation`, `css-transition`, `user-events`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Hero-страница Animata: слева логотип + «ANIMATA» волной (`WaveReveal`),
описание с тремя волнисто подчёркнутыми словами и две кнопки; справа
стопка из трёх повёрнутых карточек-виджетов (Cycling, Direction Card,
Water Tracker) с печатающейся подписью; наведение на слово выводит
соответствующую карточку наверх.

## Когда использовать

Почти никогда целиком: это демо самой библиотеки (`published: false`,
labels `requires-interaction`, `hover`). Полезна идея «слово в тексте ↔
карточка в стопке» для объяснения трёх свойств.

## Фразы из озвучки

- «красиво, функционально и интерактивно»
- «три кита нашего продукта»
- «наведите — и увидите»

## Визуальный стиль

Тёмный `slate-800`, карточки `slate-900/700/500` с inset-тенью, повороты
±15°, жёлтые акценты.

## Входные данные

`className?`. Всё остальное зашито: тексты, порядок карточек, импорт
`@/public/android-chrome-192x192.png`.

## Анимации

`animate-fadeIn` (CSS keyframes), `WaveReveal`, `TypingText`
(`repeat={false}`, `setInterval`), карточки `transition-all duration-700`
при смене `cardStack` по `onMouseOver`.

## Исходники и документация

- `templates/react-libriry/animata/animata/hero/hero-section.tsx` — компонент
- `templates/react-libriry/animata/content/docs/hero/hero-section.mdx` — документация (published: false)
- `templates/react-libriry/animata/animata/hero/hero-section.stories.tsx` — пример

## Зависимости

`@/components/ui/button`, `@/animata/text/typing-text`,
`@/animata/text/wave-reveal`, `@/animata/widget/cycling`,
`@/animata/widget/direction-card`, `@/animata/widget/water-tracker`.

## Совместимость и адаптация

`complex`: композиция из шести внутренних модулей (три виджета вне этого
среза) + hover-логика стопки. Для видео проще собрать сцену заново из
адаптированных `wave-reveal`/`typing-text` и нужных виджетов, переставляя
карточки по таймкодам.

## Паттерны

`comparison`, `key-point-emphasis`
