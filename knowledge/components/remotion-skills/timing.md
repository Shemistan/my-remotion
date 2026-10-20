# Timing: interpolate и easing — `remotion-skills/timing`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-skills` (`official_skills/skills`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | не указана (нет LICENSE, нет поля license в package.json) |

## Что визуализирует

Не рисует; документ о скорости и характере движения.

## Когда использовать

Каждый раз, когда задаётся анимация: какой easing, клампить ли, как сделать
вход–удержание–выход одним вызовом, как сделать нарочито рваный темп.

## Фразы из озвучки

- «заголовок мягко выплывает»
- «элемент вырастает и замирает»
- «рубленый ритм, как в стоп-моушене»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

- `interpolate(frame, [0, 0.3 * fps], [0, 1])` — по умолчанию **без** clamp;
- `extrapolateLeft/Right: "clamp"`;
- `Easing.spring({damping: 200})` — толчок без отскока;
- `Easing.bezier(0.16, 1, 0.3, 1)`;
- `output: 'perceptual-scale'` для scale;
- несколько ключей `[0, 1*fps, 9*fps, 10*fps] → [0, 1, 1, 0]` с массивом
  из n−1 easing;
- `posterize: 3` — брать каждый 3-й кадр.

## Исходники и документация

- `official_skills/skills/skills/remotion-markup/timing.md`
- `official_skills/skills/skills/remotion-best-practices/remotion-markup/timing.md` — копия

## Зависимости

`remotion`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

`transformation`
