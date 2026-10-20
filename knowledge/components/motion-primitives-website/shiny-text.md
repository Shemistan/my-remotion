# ShinyText — `motion-primitives-website/shiny-text`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Текст с бегущим бликом: градиент `#000 → #fff → #000`, обрезанный по
буквам, бесконечно сдвигается.

## Когда использовать

«Металлический» блеск названия, премиальный бейдж, статус «в процессе».
Аналог `motion-primitives/text-shimmer`.

## Фразы из озвучки

- «премиальная версия»
- «блестящий результат»
- «идёт обработка»

## Визуальный стиль

Чёрно-белый перелив, `background-size 200% 100%`; на тёмном фоне чёрные
края градиента почти не видны — подобрать цвета под фон.

## Входные данные

`ShinyTextProps`: `children: ReactNode`; `className?`.

## Анимации

CSS `animate-shimmer`: keyframes `shimmer` (`backgroundPosition 0 0 →
-200% 0`, 2 с, linear, infinite) из `tailwind.config.ts`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/gradient-text.tsx` — компонент
- `templates/react-libriry/motion-primitives-website/tailwind.config.ts` — keyframes `shimmer`

## Зависимости

`tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: класс `animate-shimmer` убрать,
`backgroundPosition: \`${-200 * ((frame % (2*fps)) / (2*fps))}% 0\``
в inline-style.

## Паттерны

`key-point-emphasis`
