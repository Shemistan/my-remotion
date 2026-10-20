# MatrixRain — `remotion-bits/matrix-rain`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

«Цифровой дождь» из фильма «Матрица»: колонки символов падают сверху вниз,
голова потока белая со свечением, хвост затухает; символы меняются каждые
4 кадра. Заполняет весь кадр (`AbsoluteFill`, фон прозрачный).

## Когда использовать

Фон для тем про хакеров, данные, кибербезопасность, ИИ, «код повсюду».
Под текстом — затемнить или уменьшить `density`. Для спокойного фона —
`gradient-transition`; для «живых» точек — `particle-system`.

## Фразы из озвучки

- «в мире, где всё состоит из кода»
- «хакеры получили доступ к данным»
- «миллионы строк данных каждую секунду»

## Визуальный стиль

Моноширинный шрифт, по умолчанию зелёный `#00FF00`, голова белая с
`text-shadow`. Техно, тёмные сцены.

## Входные данные

`MatrixRainProps`: `fontSize?` (20, также шаг сетки), `color?` ("#00FF00"),
`speed?` (1; скорость колонки = speed·(0.5…2)·fontSize px/кадр), `density?`
(0…1, 1 — доля колонок с потоком), `streamLength?` (20 символов), `charset?`
(цифры, латиница, знаки).

## Анимации

Позиция головы: `(frame·speedPx + offset) % (height + streamLength·fontSize)`;
параметры колонок — `random(seed)` из remotion; символ — `random(seed колонки,
строки, floor(frame/4))`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/components/MatrixRain.tsx` — компонент
- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-text/MatrixRain.tsx` — пример

## Зависимости

`remotion` (`AbsoluteFill`, `useCurrentFrame`, `random`), внутренний
`hooks/useViewportRect`.

## Совместимость и адаптация

`native`, детерминирован. Каждый видимый символ — отдельный `div`
(колонок ≈ width/fontSize, до `streamLength` на колонку): при мелком шрифте в
4K это тысячи узлов — рендер медленнее; увеличить `fontSize` или снизить
`density`.

## Паттерны

`abstract-concepts`, `quantities`
