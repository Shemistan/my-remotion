# Pixel Candlestick — `free-remotion-templates/pixel-candlestick-ohlc`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `charts-data` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

8-битный биржевой свечной график (OHLC): свечи «выпрыгивают» по одной слева
направо, зелёные растущие и красные падающие слегка переливаются; в шапке
тикер, текущая цена `$NNNNN` и «UP/DOWN ±x.x%»; пунктир уровня последней
цены и мигающая точка; сетка с подписями «20k…80k».

## Когда использовать

Финансы, крипта, трейдинг, «рынок лихорадит». Данные НЕ передаются:
ряд генерируется детерминированным случайным блужданием (`seed`), цены —
`20000 + p·60000`. Для реальных данных заменить `buildSeries` на prop
`Ohlc[]`. Для простого тренда — `line-chart-anim`.

## Фразы из озвучки

- «биткоин снова штормит»
- «рынок то растёт, то падает»
- «за день цена выросла на несколько процентов»

## Визуальный стиль

Пиксель-арт 480×270 с апскейлом, тёмная панель `#0a0f1e`, неоновые
`#2ee06a`/`#ff4d5e`/`#7fe9ff`, битмап-шрифт 5×7, дизеринг и CRT-скин.
1920×1080, 180 кадров.

## Входные данные

`PixelCandlestickOhlcProps`: `backgroundColor` (`#0a0f1e`), `gridColor`
(`#1b2942`), `bullColor` (`#2ee06a`), `bearColor` (`#ff4d5e`), `accentColor`
(`#7fe9ff`), `candleCount` (24, ограничено 4–40), `volatility` (0.5),
`cycleSpeed` (6 — один цикл палитры за клип), `ticker` («BTC/USD»).

## Анимации

Свечи появляются за первые 74 % длительности (`frame / perCandle`), каждая
«поп» за 6 кадров (тело растёт от центра, фитиль пропорционально);
переливы `cyclePalette`; цена в шапке следует за закрытием последней
показанной свечи (ступенчато); точка мигает `sin(frame·0.5)`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/pixel-candlestick-ohlc/PixelCandlestickOhlc.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/index.ts` — реэкспорт pixel-kit
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/render.tsx` — `PixelStage`
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/fx.tsx` — `BitmapText`, `PixelDither`, `Crt*`
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion`, `react`, внутренний `src/pixel-kit` (`seed`, `cyclePalette`, `quantizeToCell`).

## Совместимость и адаптация

`native`. Тайминг от константы `DURATION_FRAMES = 180`. Данные и шкала цен
зашиты — для реального ряда нужна правка кода.

## Паттерны

`growth-decline`, `timeline`, `quantities`
