# HyperText — `magicui/hyper-text`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `timers`, `dom`, `user-events`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Моноширинный заголовок капсом: буквы сначала мелькают случайными
символами, затем слева направо «встают» на правильные — эффект
дешифровки.

## Когда использовать

Хакерская/тех-тематика: «расшифровка», «взлом», «данные», кодовые
имена, появление названия. Для спокойного появления — `text-animate`.

## Фразы из озвучки

- «расшифровываем данные»
- «кодовое имя проекта — ...»
- «система определила угрозу»

## Визуальный стиль

`font-mono`, `text-4xl font-bold`, всё в верхнем регистре; быстрый
нервный темп (800 мс по умолчанию).

## Входные данные

- `children: string` (обязателен)
- `duration?` = `800` (мс), `delay?` = `0` (мс)
- `as?` = `"div"` (набор `motion.*` тегов)
- `startOnView?` = `false`; `animateOnHover?` = `true`
- `characterSet?: string[]` = латиница A–Z
- `className`, прочие `MotionProps`.

## Анимации

Старт через `setTimeout(delay)` или `IntersectionObserver`; цикл
`requestAnimationFrame`: `progress = elapsed/duration`, буква `i`
фиксируется при `i <= progress·len`, остальные —
`characterSet[Math.random()…]`. Повтор при `onMouseEnter`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/hyper-text.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/hyper-text.mdx` — документация

## Зависимости

`motion` (`AnimatePresence`, `motion.*` — без реальной анимации), `cn`.

## Совместимость и адаптация

`adaptable`: состояние — функция прогресса. Удалить rAF/таймер/
observer/hover; `progress = clamp((frame - delayFrames)/durFrames)`;
случайную букву брать `random(\`${i}-${frame}\`)` из `remotion`, чтобы
кадры были детерминированы (можно менять символ раз в 2–3 кадра).

## Паттерны

`transformation`, `key-point-emphasis`
