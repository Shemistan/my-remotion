# OrbitingCircles — `motion-primitives-website/orbiting-circles`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Элемент (иконка, логотип), вращающийся по круговой орбите вокруг центра
контейнера, оставаясь вертикальным; пунктирная окружность-траектория.

## Когда использовать

«Интеграции вокруг продукта», экосистема, «всё вращается вокруг
клиента»; несколько экземпляров со сдвигом `delay` дают кольцо иконок.
Готовая двухкольцевая композиция — `orbit-system`.

## Фразы из озвучки

- «интеграция со всеми вашими сервисами»
- «экосистема вокруг продукта»
- «в центре — пользователь»

## Визуальный стиль

Пунктир `strokeDasharray 4 4`, цвет `stroke-border/20` (CSS-переменная
темы); linear, `duration` 20 с на оборот.

## Входные данные

`OrbitingCirclesProps`: `children`; `reverse?` (false); `duration?` (20,
с); `delay?` (0, с); `radius?` (50, px); `path?` (true); `className?`.

## Анимации

Inline `animation: orbit {duration}s linear {delay}s infinite`;
keyframes в `<style jsx>`: `rotate(0→360deg) translateY(var(--radius))
rotate(0→-360deg)`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/orbit.tsx` — компонент (+ `OrbitSystem`)

## Зависимости

`react`, `styled-jsx` (встроен в Next.js; вне Next нужен отдельно),
`tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `<style jsx>` и `animation` убрать; угол
`a = (reverse ? -1 : 1) * 360 * (frame/fps - delay) / duration`,
`transform: rotate(${a}deg) translateY(${radius}px) rotate(${-a}deg)`.
Цвет пунктира задать явно.

## Паттерны

`relationships`, `system-structure`
