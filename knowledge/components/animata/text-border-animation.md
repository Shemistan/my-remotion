# TextBorderAnimation — `animata/text-border-animation`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Слово с жёлтой полосой 4px под ним: полоса въезжает слева, на уходе
уезжает вправо.

## Когда использовать

Подчеркнуть термин, «выделим маркером». В видео — один проход полосы под
ключевое слово. Hover-анимацию воспроизвести по кадру.

## Фразы из озвучки

- «подчеркну этот момент»
- «ключевое слово — …»
- «запишем»

## Визуальный стиль

`text-xl xl:text-5xl font-medium`, полоса `bg-yellow-500`, 300 мс.

## Входные данные

`text: string` (`"Programming"`), `className?`.

## Анимации

Две полосы с `transition-transform duration-300`: hover-in —
`-translate-x-full → 0` + opacity; hover-out — вторая `0 → translate-x-full`,
сброс через `setTimeout(300)`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/text-border-animation.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/text-border-animation.mdx` — документация
- `templates/react-libriry/animata/animata/text/text-border-animation.stories.tsx` — пример

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

Одна полоса: `translateX = interpolate(frame, [in, in+9, out, out+9],
[−100%, 0, 0, 100%])` (9 кадров ≈ 300 мс при 30 fps). Таймер и обработчики
убрать.

## Паттерны

`key-point-emphasis`
