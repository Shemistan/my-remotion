# VpnConnection (VPN Widget) — `animata/vpn-widget`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition`, `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Виджет VPN 208×208: тёмно-синяя рамка с флажком и сервером «Tokyo»,
пинг «53 ms» с пульсирующей зелёной точкой, скорость «57.4 Mbps» и
сдвижной переключатель «Disconnected / Not secured» ↔ «Connected /
Secured» с красной/зелёной точкой.

## Когда использовать

Безопасность, приватность, «подключение защищено», переход «до/после»
одним щелчком.

## Фразы из озвучки

- «одно нажатие — и вы под защитой»
- «соединение установлено»
- «скорость не пострадала»

## Визуальный стиль

sky-950 рамка, amber-400 флаг, белая внутренняя карточка rounded-[22px],
переключатель-капсула; аккуратный системный UI.

## Входные данные

`className?`, `serverName = "Tokyo"`, `latency = "53 ms"`,
`downloadMbps = "57.4"`, `defaultConnected = false`, `connected?`
(контролируемый режим), `onConnectedChange?`.

## Анимации

Ползунок — `transition-[left] duration-200 ease-out`, точки —
`transition-opacity`; пинг — `animate-pulse`.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/vpn-widget.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/vpn-widget.mdx` — документация
- `templates/react-libriry/animata/animata/widget/vpn-widget.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: передавать `connected={frame > t}`; для плавности ползунка —
inline `left` из `interpolate(frame - t, [0, 6], [34, 2])` вместо
transition; пульс — opacity из `sin(frame)`.

## Паттерны

`transformation`, `cause-effect`
