# OrbitingItems3D — `animata/orbiting-items-3-d`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `timers`, `css-animation`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Светящийся фиолетовый логотип в центре (парит вверх-вниз) и 6 цветных
иконок в «стеклянных» кружках, летающих по наклонённому эллипсу; ближние
(передняя половина) крупнее и поверх логотипа, дальние — меньше и за ним.

## Когда использовать

«Наш продукт в центре вселенной», объёмная экосистема/интеграции, интро.
Плоская версия — `animata/orbiting-items`.

## Фразы из озвучки

- «в центре — ваш бизнес»
- «вокруг — все нужные сервисы»
- «объединяем инструменты в одну систему»

## Визуальный стиль

Фон slate-950 → purple-950, glass-кружки 80px (backdrop-blur, тень
purple), центр — градиент violet→indigo с glow; премиально.

## Входные данные

`radiusX = 120`, `radiusY = 30` (%), `tiltAngle = 330` (°), `duration = 25`
(мс на 1° поворота → оборот ≈ 9 с), `items = LucideIcons` (6 иконок),
`backgroundClassName?`, `containerClassName?`, `className?`. В типах
`radiusX/radiusY/tiltAngle/duration/items` помечены обязательными, но
дефолты есть.

## Анимации

`setInterval(duration)` у каждой иконки увеличивает угол на 1°; позиция
по эллипсу с поворотом на `tiltAngle`, `scale 1.2/0.9` и `zIndex` по
половине орбиты с CSS `transition: transform 0.8s`; центр — `animate-float`.

## Исходники и документация

- `templates/react-libriry/animata/animata/list/orbiting-items-3-d.tsx` — компонент
- `templates/react-libriry/animata/content/docs/list/orbiting-items-3-d.mdx` — документация
- `templates/react-libriry/animata/animata/list/orbiting-items-3-d.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/components/icons` (логотип), `@/lib/utils`.

## Совместимость и адаптация

`complex` по классу (таймеры), но переписывается просто: `angle_i =
(i*360/n + frame/fps * 360/9) % 360`, остальная геометрия — из кода;
scale интерполировать по `sin(angle)` вместо transition; `animate-float`
→ `translateY(-40*sin(...))` из кадра. Логотип заменить своим.

## Паттерны

`system-structure`, `relationships`, `spatial`
