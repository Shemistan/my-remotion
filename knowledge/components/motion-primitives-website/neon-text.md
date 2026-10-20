# NeonText — `motion-primitives-website/neon-text`

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

Жирный текст с неоновым свечением (двойной `drop-shadow` 10 px и 30 px)
одного из пяти цветов.

## Когда использовать

Киберпанк, ночной город, игровые и техно-ролики, вывеска «OPEN»,
акцентная надпись на тёмном фоне. Анимации нет — мерцание добавляется
по кадру.

## Фразы из озвучки

- «добро пожаловать в будущее»
- «ночью город оживает»
- «уровень пройден»

## Визуальный стиль

`text-{cyan|purple|pink|green|yellow}-400` + `drop-shadow` того же цвета
(0.8 и 0.4 альфа); только на тёмном фоне.

## Входные данные

`NeonTextProps`: `children: ReactNode`; `color?: 'cyan'|'purple'|'pink'|
'green'|'yellow'` (`'cyan'`); `className?`.

## Анимации

Нет: статичные классы.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/gradient-text.tsx` — компонент

## Зависимости

`tailwindcss` (arbitrary `drop-shadow-[...]`), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: рендерится как есть (детерминированно). Для «включения
неона» — `opacity`/интенсивность тени из кадра, мерцание — по
`random(\`flicker-${Math.floor(frame/2)}\`)` из remotion. Без Tailwind —
перенести в `filter: drop-shadow(...) drop-shadow(...)`.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
