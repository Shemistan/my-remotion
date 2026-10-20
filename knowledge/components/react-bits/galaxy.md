# Galaxy — `react-bits/galaxy`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Звёздное поле в несколько слоёв (до 8) с бликами-«флерами» и свечением,
медленный полёт; курсор отталкивает звёзды, клик — «варп».

## Когда использовать

Космос, масштаб, мечта, бесконечность возможностей, интро/аутро.

## Фразы из озвучки

- «вселенная возможностей»
- «мы только в начале пути»
- «масштаб, который сложно представить»

## Визуальный стиль

Звёзды с лёгким свечением (`glowIntensity = 0.3`), тёмное небо, до 4 цветов.

## Входные данные

Из usage: `density = 1`, `glowIntensity = 0.3`, `flareIntensity = 1`,
`starSpeed = 0.5`, `mouseRepulsion`, `clickWarp`. Остальное — PropTable демо.

## Анимации

Сырой WebGL2 (fullscreen-шейдер), полёт по времени из rAF, интро 2.2 с.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Galaxy/Galaxy.jsx` (+ `Galaxy.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Galaxy/Galaxy.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/GalaxyDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1, `mouseRepulsion={false}`, `clickWarp={false}`;
«варп» под фразу — программно по кадру.

## Паттерны

`abstract-concepts`, `spatial`
