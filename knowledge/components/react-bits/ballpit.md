# Ballpit — `react-bits/ballpit`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Бассейн из сотен 3D-шаров с PBR-материалом (satin, matte, gloss, frosted,
metal), которые сталкиваются, падают под гравитацией или парят; курсор
расталкивает и «хватает» шары.

## Когда использовать

Игривый фон: «много всего», объём, веселье, бренд с цветными шарами. Не
брать для серьёзных тем.

## Фразы из озвучки

- «сотни идей в одном месте»
- «всё смешалось, и это прекрасно»
- «давайте немного поиграем»

## Визуальный стиль

Глянцевые сферы (по умолчанию белые), мягкий свет, физика.

## Входные данные

`count = 200`, `colors = ['#ffffff']` (hex или числа), `material = 'satin'`,
`minSize = 0.5`, `maxSize = 1`, `gravity = 0.5`, `friction = 0.9975`,
`wallBounce = 0.95`, `bounce = 0.85`, `depth`, … ; в демо `followCursor`,
`grab`, `clickEffect = 'burst' | 'none'`, `intro`. Полный список —
PropTable демо. Usage-пример: «inspired by Kevin Levron».

## Анимации

Сырой WebGL2 (константы `FOV = 50`, `CAMERA_Z = 20`, материалы в
`MATERIALS`), физика столкновений шаг за шагом в rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Ballpit/Ballpit.jsx`
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Ballpit/Ballpit.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/BallpitDemo.jsx`

## Зависимости

`react`; сырой WebGL2 (CSS-файла нет).

## Совместимость и адаптация

`complex`: накопительная физика — рецепт R3 (детерминированный seed,
прогон симуляции от 0 до кадра с фиксированным шагом) + R1 для рендера.

## Паттерны

`quantities`, `abstract-concepts`
