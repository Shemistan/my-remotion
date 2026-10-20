# BottomUpLetters — `animata/bottom-up-letters`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Короткое слово собирается «лесенкой»: буквы по одной поднимаются снизу
(46px) с заметной задержкой между символами.

## Когда использовать

Одно-два ударных слова-заголовка: «Рост», «Старт». Для длинных фраз stagger
88 мс слишком медленный — брать `animata/per-character-rise`. Зеркальный
вариант сверху — `animata/top-down-letters`.

## Фразы из озвучки

- «поднимаемся выше»
- «рост, шаг за шагом»
- «запуск»

## Визуальный стиль

Кинетичный, игривый; цвет и шрифт через `className`. Выраженный staircase.

## Входные данные

`text?: string | string[]` (по умолчанию `["Climb","Lift","Stack"]`),
`enter?`, `exit?`, `speed?` (0.72), `holdMs?` (550), `gapMs?` (320),
`yTravel?` (0.58), `className?`. Спека: `target: "per-character"`; enter 400 мс
/ stagger 88 / `cubic-bezier(0.18,1,0.32,1)`, from `{opacity 0, yPx 46}`; exit
280 / 28, to `{opacity 0, yPx −14}`; swap `sequential`, `microDelayMs 35`.

## Анимации

Посимвольный stagger: opacity + translateY; выход — быстрый подъём вверх.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/bottom-up-letters.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/bottom-up-letters.mdx` — документация
- `templates/react-libriry/animata/animata/text/bottom-up-letters.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Тот же runtime, что у всех пресетов: WAAPI + `setTimeout` + случайная задержка
старта. Рецепт «TextAnimator → кадр» в `compatibility/animata-text-graphs-cards.md`
(юнит = символ, ранг = индекс).

## Паттерны

`growth-decline`, `key-point-emphasis`
