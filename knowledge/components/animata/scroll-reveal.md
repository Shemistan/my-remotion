# ScrollReveal — `animata/scroll-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `user-events`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Абзац, в котором слова по очереди «загораются» (opacity 0.5 → 1) по мере
прокрутки контейнера — читаемый манифест.

## Когда использовать

Цитата, манифест, длинный тезис, который зритель «дочитывает» вместе с
диктором. В видео прогресс берётся из кадра (как караоке).

## Фразы из озвучки

- «прочитаем это вместе»
- «наша миссия проста»
- «каждое слово здесь важно»

## Визуальный стиль

Крупный текст на контрастном фоне `bg-foreground text-background`, `h-96`;
наследует `className` дочерних элементов (можно подсветить слова).

## Входные данные

`ScrollRevealProps` (+ атрибуты `div`): `children: ReactNode` (строки
дробятся по пробелам, элементы сохраняются), `className?`.

## Анимации

Свой `scrollYProgress` (`scrollTop / maxScroll`) → для узла i `opacity =
useTransform(progress, [i/total, (i+1)/total], [0.5, 1])`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/scroll-reveal.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/scroll-reveal.mdx` — документация
- `templates/react-libriry/animata/animata/text/scroll-reveal.stories.tsx` — пример

## Зависимости

`motion` (`useMotionValue`, `useTransform`, `motion.span`).

## Совместимость и адаптация

Заменить scroll на `progress = interpolate(frame, [start, end], [0, 1])`,
`opacity_i = interpolate(progress, [i/total, (i+1)/total], [0.5, 1],
clamp)`; убрать прокручиваемый контейнер и spacer-блоки `h-32`.

## Паттерны

`sequence-steps`, `key-point-emphasis`
