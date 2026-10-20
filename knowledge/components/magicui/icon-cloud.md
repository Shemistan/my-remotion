# IconCloud — `magicui/icon-cloud`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `user-events`, `dom`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Сфера из иконок или картинок (раскладка по сфере Фибоначчи), которая
вращается; дальние иконки мельче и прозрачнее. Клик по иконке
плавно поворачивает её к зрителю.

## Когда использовать

Стек технологий, набор интеграций, «все инструменты в одном месте»,
облако навыков. Для орбит вокруг центра — `orbiting-circles`.

## Фразы из озвучки

- «весь наш технологический стек»
- «поддерживаем десятки инструментов»
- «целая вселенная интеграций»

## Визуальный стиль

Canvas 400×400, иконки 40 px, scale `(z+200)/300`, opacity 0.2–1;
без иконок — синие круги `#4444ff` с номерами. Кнопка Play/Pause.

## Входные данные

- `icons?: ReactNode[]` (SVG-иконки → `renderToString` → data-URL)
- `images?: string[]` (URL картинок, `crossOrigin="anonymous"`)
- `showControl?` = `true` (кнопка паузы shadcn)

## Анимации

`requestAnimationFrame`: поворот `rotation += (dy/h, dx/w)·speed`,
скорость зависит от позиции мыши (0.003–0.013); drag мышью; по клику
`targetRotation` с `easeOutCubic` за 800–2000 мс; проекция вращением
вокруг X/Y. Иконки рисуются на offscreen canvas после `img.onload`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/icon-cloud.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/icon-cloud.mdx` — документация

## Зависимости

`react-dom/server` (`renderToString`), `lucide-react`, shadcn `button`.

## Совместимость и адаптация

`complex`: интегрируемый поворот в rAF + мышь + асинхронная загрузка
картинок. Переписать: `rotation.y = speed·frame`, `rotation.x = const`
(или траектория), позиции по формуле Фибоначчи уже детерминированы;
рендер в `useEffect([frame])` на canvas или проще — абсолютные `div`/
`Img` с `transform` и `zIndex` по глубине. Загрузку картинок обернуть
`delayRender`, кнопку убрать.

## Паттерны

`system-structure`, `relationships`, `spatial`
