# SlackIntro — `animata/slack-intro`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `layout-templates` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Интро в стиле Slack: на фиолетовом фоне `bg-purple-950` пять строк из
цветных «таблеток» и кругов (зелёный, жёлтый, фиолетовый, голубой, красный)
поочерёдно въезжают слева/справа; в белых капсулах волной проявляются слова
«Introducing / the new / User Experience»; по флагу строки разъезжаются.

## Когда использовать

Интро/аутро ролика, анонс продукта, «представляем новое…». Готовая
композиция целиком — тексты в капсулах поменять.

## Фразы из озвучки

- «представляем новую версию»
- «встречайте обновлённый интерфейс»
- «это новый пользовательский опыт»

## Визуальный стиль

Яркий, графичный, корпоративно-игривый; круги `h-8 md:h-16`, капсулы до
`md:w-[700px]`, текст `md:text-6xl font-bold text-purple-950`.

## Входные данные

`animateOut?: boolean` — через `setTimeout(3000)` строки уходят. Тексты
капсул зашиты (`"Introducing"`, `"the new"`, `"User Experience"`).
Внутренние `Circle` (`height, width, bgColor, borderRadius`) и `Cylinder`
(`text, height, width, bgColor`).

## Анимации

`tw-animate-css`: `animate-in fade-in slide-in-from-right-full` /
`slide-in-from-left-full` (чередуются), `duration-500…1000`,
`fill-mode-forwards`; выход — `animate-out fade-out slide-out-to-*-full`.
Текст — `animata/wave-reveal` (`direction="up"`, `delay 200`, `duration
1000ms`, `blur={false}`).

## Исходники и документация

- `templates/react-libriry/animata/animata/hero/slack-intro.tsx` — компонент
- `templates/react-libriry/animata/animata/text/wave-reveal.tsx` — текст
- `templates/react-libriry/animata/content/docs/hero/slack-intro.mdx` — документация
- `templates/react-libriry/animata/animata/hero/slack-intro.stories.tsx` — пример

## Зависимости

`tw-animate-css`, `@/animata/text/wave-reveal`, `@/lib/utils`.

## Совместимость и адаптация

Для строки k: `translateX = interpolate(frame, [s_k, s_k + d_k], [±100%, 0])`
+ opacity (направление чередуется, d = 15–30 кадров); выход — обратная
интерполяция с кадра `out`. Тексты вынести в props; `wave-reveal` адаптировать
по его карточке. `setTimeout` убрать.

## Паттерны

`key-point-emphasis`, `transformation`
