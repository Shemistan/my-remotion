# GithubCardShiny — `animata/github-card-shiny`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `dom`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Карточка GitHub Actions: файл `cmake.yml`, триггер `on: push` и список
шагов с зелёными галочками и временем (Install dependencies 1m 20s, Build
2m 10s, Test 1m 30s); за курсором по карточке плывёт мягкий белый блик.

## Когда использовать

CI/CD, «сборка прошла», автоматизация, DevOps-пайплайн. Как статичная
композиция хороша; блик — воспроизвести по кадру (траектория вместо мыши).

## Фразы из озвучки

- «все проверки пройдены»
- «сборка заняла пять минут»
- «пайплайн запускается на каждый push»

## Визуальный стиль

Тёмный dev-UI `bg-zinc-700/600`, `font-mono`, иконки `CheckCircle2`.

## Входные данные

`className?`. Шаги и названия зашиты в массиве внутри компонента — для
видео вынести в props (`steps: {title, time}[]`).

## Анимации

`useMousePosition(containerRef, update)` пишет `--x/--y` в стиль блика
(`h-64 w-64 blur-3xl`, opacity 0 → 0.2 по `group-hover/shiny`).

## Исходники и документация

- `templates/react-libriry/animata/animata/card/github-card-shiny.tsx` — компонент
- `templates/react-libriry/animata/content/docs/card/github-card-shiny.mdx` — документация
- `templates/react-libriry/animata/animata/card/github-card-shiny.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/hooks/use-mouse-position`, `@/lib/utils`.

## Совместимость и адаптация

Убрать `useMousePosition`; `--x/--y` задать из кадра (диагональный проход
или окружность), opacity блика 0.2. Дополнительно: шаги проявлять по
очереди и показывать галочку по таймкоду.

## Паттерны

`sequence-steps`, `system-structure`
