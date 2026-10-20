# Skill remotion-motion-graphics — `remotion-motion-graphics-skill/remotion-motion-graphics`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-motion-graphics-skill` (`templates/remotion-components/remotion-motion-graphics-skill`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, README) |

## Что визуализирует

Не рисует; skill о моушн-графике в Remotion: титры, lower third,
логостинги, бейджи, раскрытие цифр, отсчёты, end screens, рилсы — с
экспортом в MP4 или прозрачный ProRes/PNG для Premiere, FCP, CapCut,
DaVinci, After Effects.

## Когда использовать

Нужно, чтобы графика выглядела профессионально. Три опоры skill:

1. **Диагностика до украшательства** — «плоско» часто значит баг (пример:
   `interpolate(frame, [0, 60], [0, 12400])` без clamp доходит до 30 793).
2. **Проверка** — `npx remotion still <CompId> out/check.png --frame=45` на
   ключевых кадрах и реально посмотреть картинку; альфа — по шахматке Studio.
3. **Тихие ловушки** — `references/traps.md`.

Чек-лист: enter → hold → exit; не линейно (`spring()` первым); stagger 3–5
кадров; idle life; payoff; геометрический свет вместо клипарта, один
акцент; поля 5–10 %; ~1 с на строку; пропсы через zod + `defaultProps`;
размеры от `useVideoConfig()` и `sec()`. Звук — «половина полировки»:
whoosh на вход, click, chime, swish; срезать тишину в начале файлов.

## Фразы из озвучки

- «сделаем плашку с именем спикера»
- «цифра появляется и красиво фиксируется»
- «заставка для канала с прозрачным фоном»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Enter/hold/exit, spring с перелётом, stagger, idle life, payoff.

## Исходники и документация

- `templates/remotion-components/remotion-motion-graphics-skill/skills/remotion-motion-graphics/SKILL.md`
- `templates/remotion-components/remotion-motion-graphics-skill/README.md`
- ссылки: `remotion-motion-graphics-skill/traps`, `remotion-motion-graphics-skill/patterns`, `remotion-motion-graphics-skill/polish`, `remotion-motion-graphics-skill/scaffold`

## Зависимости

`remotion`, `@remotion/cli`, `zod`, `@remotion/zod-types`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

`key-point-emphasis`
