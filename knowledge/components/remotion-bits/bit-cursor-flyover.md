# Cursor Flyover (bit) — `remotion-bits/bit-cursor-flyover`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `ui-mockups` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Скриншот приложения лежит в 3D; камера сначала показывает его целиком,
затем по очереди приближается к четырём углам, а SVG-курсор перелетает в
ту же точку (иногда «пульсирует» масштабом), в конце — общий план.

## Когда использовать

Демонстрация интерфейса: «здесь настройки, тут — отчёты», обзор
дашборда, онбординг по экрану. Для мокапа кода — `code-block`.

## Фразы из озвучки

- «в левом верхнем углу — навигация»
- «нажмите сюда, чтобы создать отчёт»
- «а здесь видна вся статистика»

## Визуальный стиль

Тёмный фон `#0a0a0a`, скриншот со скруглением 1,5 vmin и глубокой тенью,
курсор-стрелка (lucide-подобный путь) с drop-shadow; 300 кадров, 1920×1080.

## Входные данные

Без props: картинка `src="/gallery.png"` (из public папки docs), ширина 120
vmin, соотношение 0.4; точки шагов — `resolvePoint(imgRect, "topLeft"…)`.
Для своего экрана — заменить путь и, при другой пропорции, коэффициент.

## Анимации

`Scene3D` (`perspective` 1200, переход и шаг по 45 кадров,
`easeInOutCubic`): шаги overview → 4 угла (z = 0.2·ширины) → zoom-out.
Курсор — `StepResponsive` (позиция угла, opacity, `scale` [1,2,1] на
некоторых шагах, duration 35) вокруг `Element3D`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/scene-3d/CursorFlyover.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/cursor-flyover.mdx` — документация

## Зависимости

`remotion-bits` (`Scene3D`, `Step`, `Element3D`, `StepResponsive`,
`useViewportRect`, `createRect`, `resolvePoint`). См. `remotion-bits/scene-3d`.

## Совместимость и адаптация

`native` по движению. Картинка — обычный `<img src="/gallery.png">`: в
Remotion заменить на `<Img src={staticFile("gallery.png")}>`, иначе кадры
до загрузки пустые, а путь `/gallery.png` не найдётся.

## Паттерны

`spatial`, `sequence-steps`, `key-point-emphasis`
