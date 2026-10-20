# Floating3DParticles — `magicui/floating-3d-particles`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Объёмное облако частиц, вращающееся вокруг вертикальной оси с
перспективой (ближние крупнее), частицы медленно всплывают вверх.

## Когда использовать

Атмосферный 3D-фон: «пространство идей», «экосистема», «облако
данных», заставки. Для плоской пыли — `particles`.

## Фразы из озвучки

- «целая вселенная возможностей»
- «облако данных вокруг нас»
- «всё находится в постоянном движении»

## Визуальный стиль

Фиолетовые `#8B5CF6` круги радиуса 3–7 px, opacity 0.1–0.5, 400
штук; плавное вращение и всплытие.

## Входные данные

- `quantity?` = `400` (при ширине окна < 768 — 20 %)
- `color?` = `"#8B5CF6"` (hex), `size?` = `5`, `opacity?` = `0.3`
- `drift?` = `0.8` (px за кадр, + вверх), `depth?` = `0.5` (0–1)
- `className?`, `style?`, атрибуты `canvas`.

## Анимации

Canvas 2D, `requestAnimationFrame`: на тик `angle += angularSpeed`
(0.0015–0.0025), `y -= drift`; проекция `scale = fov/(fov + pd +
sin(angle)·depthRange)`; сортировка по глубине; при выходе за край —
новый случайный радиус. Пауза по `IntersectionObserver` и
`visibilitychange`, статичный кадр при reduced motion.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/floating-3d-particles.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/floating-3d-particles.mdx` — документация

## Зависимости

React, `cn`.

## Совместимость и адаптация

`complex` (canvas + rAF + мутируемое состояние), но перевод почти
прямой: шаг на тик линейный, поэтому `angle = a0 + speed·frame`,
`y = wrap(y0 - drift·frame, -h, h)`, радиус при каждом переходе —
`random(\`${i}-${wrapCount}\`)`. Параметры из `random(seed)`,
рисование в `useEffect([frame])`, размер из `useVideoConfig()`,
мобильный порог убрать. Темп привязан к 60 fps браузера — при 30 fps
удвоить шаг.

## Паттерны

`abstract-concepts`, `spatial`
