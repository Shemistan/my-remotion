// Каталог ошибок (Task 48): данные — в `@ms/contracts/diagnostics` (общие с UI: карточка ошибки
// берёт оттуда ключи словаря и действия), здесь — точка входа сервера.
export {
  API_ERROR_CATALOG,
  ERROR_ACTIONS,
  ERROR_CATALOG,
  type ErrorAction,
  type ErrorCatalogEntry,
  type ErrorView,
  explainError,
  JOB_ERROR_CATALOG,
} from "@ms/contracts/diagnostics";
