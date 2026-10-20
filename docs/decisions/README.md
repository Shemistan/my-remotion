# Решения (ADR)

Файл `NNNN-коротко.md`: **контекст → решение → последствия**. Решения задним
числом не переписываем: передумали — новый ADR, старый в `статус: заменено`
с `заменён_на:`.

<!-- gate:begin adr-index -->
| № | Решение | Статус |
|---|---------|--------|
| [0001](0001-motion-studio-separate-app.md) | Motion Studio — отдельное Node/TS-приложение в my-remotion | принято |
| [0002](0002-sqlite-durable-job-runner.md) | SQLite и собственная durable-очередь задач | принято |
| [0003](0003-claude-code-restricted-runtime.md) | Агенты через `claude -p --restricted` без Bash | принято |
| [0004](0004-remotion-pin-and-motion-kit.md) | Remotion 4.0.537 с точным pin и собственный motion-kit | принято |
| [0005](0005-personal-local-tool.md) | Персональный локальный инструмент без облака и многопользовательности | принято |
| [0006](0006-external-ssd-storage.md) | Данные на внешнем SSD через `MS_DATA_DIR` под защитой StorageGuard | принято |
| [0007](0007-job-attempt-isolation.md) | Изоляция попыток задач и дочерних процессов | предложено |
<!-- gate:end adr-index -->
