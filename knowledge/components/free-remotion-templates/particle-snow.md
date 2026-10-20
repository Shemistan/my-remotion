# Snow Particles — `free-remotion-templates/particle-snow`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `particles-effects` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Снегопад в три слоя глубины (задний — мелкие медленные бледные хлопья,
передний — крупные быстрые яркие) с покачиванием, мерцающие звёзды и
лёгкий градиент неба; внизу — заголовок со свечением и подпись.

## Когда использовать

Зима, праздники, новогоднее поздравление, «спокойствие», сезонные акции.
Для торжества-события — fireworks-burst.

## Фразы из озвучки

- «с наступающим Новым годом!»
- «зимний сезон уже начался»
- «немного волшебства в конце года»

## Визуальный стиль

Ночной фон `#0f172a`, светлый снег `#e2e8f0`, голубое свечение `#38bdf8`;
мягкий, сказочный. Системный sans-serif. В Root: 1080×1080, 150 кадров.

## Входные данные

`ParticleSnowProps`: `backgroundColor`, `snowColor`, `accentColor`,
`flakeCount: number` (70), `title` («Winter Magic»), `subtitle`
(«Season's Greetings»), `textColor`.

## Анимации

Хлопья из `buildFlakes` (псевдослучайность `abs(sin(i*φ/e/π))`, `useMemo`):
Y = `startY + frame*speed + ...` по модулю высоты, X — `sin(frame*swayFreq +
phase)`. Звёзды мерцают `sin(i*2.3 + frame*0.05)`. Fade сцены 0–25, текст
fade + y 30–55.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/particle-snow/ParticleSnow.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`, без `Math.random`. Не бесшовная петля (снег по модулю, но
скорости разные). `linearGradient id="snow-sky"` фиксирован — при двух
экземплярах сделать id уникальным.

## Паттерны

`abstract-concepts`
