# FilmGrain — `motion-primitives-website/film-grain`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Оверлей киноплёночного зерна: монохромный шум на canvas в половинном
разрешении, обновляемый с заданной частотой, смешанный с картинкой
(`overlay`).

## Когда использовать

Ретро/документальная/«плёночная» стилистика, воспоминания, архивные
кадры; поверх любых сцен для «аналоговой» фактуры.

## Фразы из озвучки

- «вернёмся в прошлое»
- «как в старом кино»
- «архивные кадры»

## Визуальный стиль

`opacity` = `intensity` (0.08), `mix-blend-mode` `overlay`; 12 обновлений
в секунду.

## Входные данные

`FilmGrainProps`: `intensity?` (0.08); `fps?` (12, 0 — статично);
`blendMode?` (`'overlay'`); `className?`.

## Анимации

rAF с ограничением частоты; каждый пиксель — `Math.random()*255`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/premium-backgrounds.tsx` — компонент

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: случайный шум по пикселям каждое обновление. Переработка:
рисовать в `useEffect([grainIndex])`, где
`grainIndex = floor(frame/fps*grainFps)`, генератором с семенем от
`grainIndex` (быстрый LCG/xorshift, не `random()` на каждый пиксель —
медленно); либо заранее подготовить 3–4 PNG-текстуры зерна и
переключать по кадру (`Img` + `staticFile`) — проще и быстрее.

## Паттерны

`timeline`, `abstract-concepts`
