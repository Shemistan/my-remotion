# OrbitSystem — `motion-primitives-website/orbit-system`

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

Солнечная система из иконок: круг-центр с контентом, внутреннее кольцо
вращается по часовой стрелке, внешнее — против; элементы равномерно
распределены по кольцам.

## Когда использовать

Продукт в центре экосистемы интеграций/партнёров/команд; «двухуровневая»
структура: ядро и окружение.

## Фразы из озвучки

- «вокруг ядра — десятки интеграций»
- «ближний круг и широкая экосистема»
- «всё связано с центральной платформой»

## Визуальный стиль

Контейнер 400×400; центр 64 px, элементы 40 px — круги
`border-border bg-surface shadow` (CSS-переменные темы сайта); радиусы
80 и 160 px, обороты 20 и 30 с.

## Входные данные

`OrbitProps`: `centerContent?`; `innerOrbit?: ReactNode[]`;
`outerOrbit?: ReactNode[]`; `innerRadius?` (80); `outerRadius?` (160);
`innerDuration?` (20); `outerDuration?` (30); `className?`. `children`
объявлен в типе, но не рендерится.

## Анимации

`OrbitingCircles` для каждого элемента с `delay = i*(duration/n)`;
внешнее кольцо `reverse`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/orbit.tsx` — компонент

## Зависимости

`orbiting-circles` (внутренний), `styled-jsx`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: по рецепту `orbiting-circles`. Внимание: CSS-`delay`
положительный — до старта элементы стоят в начальной точке; в покадровой
версии взять фазу `a_i = 360*(t/duration + i/n)` — сразу равномерное
кольцо. Цвета темы задать явно; появление колец — stagger по кадру.

## Паттерны

`system-structure`, `relationships`
