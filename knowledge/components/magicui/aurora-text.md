# AuroraText — `magicui/aurora-text`

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

Слово, залитое переливающимся многоцветным градиентом («северное
сияние»); градиент плывёт, а сам текст слегка покачивается и
пульсирует масштабом.

## Когда использовать

Выделить одно ключевое слово в заголовке («магия», «AI», название
продукта). Не для абзацев и не для строгих корпоративных роликов.

## Фразы из озвучки

- «и всё это — с помощью искусственного интеллекта»
- «настоящая магия начинается здесь»
- «будущее уже наступило»

## Визуальный стиль

Яркий неоновый градиент (по умолчанию розовый → фиолетовый → синий →
голубой), плавный, «праздничный» темп.

## Входные данные

- `children: ReactNode`
- `className?: string` = `""`
- `colors?: string[]` = `["#FF0080", "#7928CA", "#0070F3", "#38bdf8"]`
- `speed?: number` = `1` (длительность цикла `10 / speed` секунд)

## Анимации

Класс `animate-aurora` → `@keyframes aurora`: `background-position`
обходит 4 точки, одновременно `rotate(-5…5deg) scale(0.9…1.1)`;
`ease-in-out infinite alternate`, `animationDuration` задаётся inline.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/aurora-text.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/registry/registry-ui.ts` — `@keyframes aurora`
- `templates/react-libriry/magicui/apps/www/content/docs/components/aurora-text.mdx` — документация

## Зависимости

React, Tailwind v4 (`bg-size-*`, `bg-clip-text`). Пакетов нет.

## Совместимость и адаптация

`adaptable`. Оставить keyframes и на внутренний `span` повесить
`animationDelay: -(frame/fps)+'s'` + `animationPlayState: 'paused'`
(учесть `alternate`: период 2×duration). Либо считать
`backgroundPosition` и `transform` из кадра через `interpolate`.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
