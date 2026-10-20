# SplitColorText — `motion-primitives-website/split-color-text`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Текст, разрезанный по вертикали на два цвета: слева один цвет, справа
другой; граница — `splitPosition` %.

## Когда использовать

Прогресс внутри слова («загружено на 60 %»), «было/стало» в одной
надписи, заливка заголовка цветом синхронно с озвучкой, если двигать
границу по кадру.

## Фразы из озвучки

- «мы прошли уже половину пути»
- «из серого — в цветное»
- «осталось совсем чуть-чуть»

## Визуальный стиль

Два слоя одного текста; верхний обрезан `clip-path: inset(0 {100-p}% 0 0)`;
по умолчанию `text-white` слева, `text-purple-500` справа.

## Входные данные

`SplitColorTextProps`: `text: string`; `leftColor?` (`'text-white'`);
`rightColor?` (`'text-purple-500'`); `splitPosition?` (50, 0–100);
`className?`.

## Анимации

Нет: позиция задаётся prop.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/gradient-text.tsx` — компонент

## Зависимости

`tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: детерминированный рендер, достаточно передавать
`splitPosition={interpolate(frame, [s, e], [0, 100], {clamp})}`.

## Паттерны

`transformation`, `growth-decline`, `comparison`
