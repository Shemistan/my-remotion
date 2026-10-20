# GibberishText — `animata/gibberish-text`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

«Расшифровка»: каждая буква быстро перебирает случайные заглавные A–Z и
через 5–14 шагов встаёт на своё место.

## Когда использовать

Дешифровка, «ИИ генерирует», хакерская тема, раскрытие секрета, тизер.

## Фразы из озвучки

- «расшифровываем сигнал»
- «нейросеть подбирает ответ»
- «секрет раскрыт»

## Визуальный стиль

Моноширинный, техно; буквы `inline-block min-w-[1ch]`; результат в верхнем
регистре.

## Входные данные

`text: string`, `className?` (на каждую букву).

## Анимации

Для каждой буквы `setInterval` 24 мс: `Math.random()` код 65–90; число шагов
`floor(random*10)+5`; затем исходная буква (`toUpperCase`).

## Исходники и документация

- `templates/react-libriry/animata/animata/text/gibberish-text.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/gibberish-text.mdx` — документация
- `templates/react-libriry/animata/animata/text/gibberish-text.stories.tsx` — пример

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

Убрать интервалы: шаг `s = floor(frameMs/24)`; длительность буквы
`n_i = floor(random('g'+i)*10)+5`; пока `s < n_i` — символ
`65 + floor(random('g'+i+'-'+s)*26)`, иначе буква. `random` из remotion
(детерминированно). Для кириллицы расширить диапазон кодов.

## Паттерны

`transformation`, `abstract-concepts`
