// Можно ли сейчас принять правку заказа: тот же отказ, что даст сервер при ответе «принять»
// (миграция 159 — экономика, потребность производства и поставка на действующем снимке фиксации;
// 157/163 — исполнение). Порядок тот же, что у сервера: ревизия снимка отказывает раньше проверки исполнения.
// Выражение отвечает NULL, когда принять можно, иначе кодом отказа, чтобы экран отключил «Принять» до нажатия и назвал причину, а не показал её только после ошибки 422.
//
// `orderAlias` — алиас таблицы orders в запросе, куда выражение вставляется.
export function orderAmendmentAcceptBlockSql(orderAlias) {
  const onCurrentSnapshot = (table) => `EXISTS (SELECT 1 FROM ${table} AS blocker WHERE blocker.order_commit_snapshot_id = ${orderAlias}.order_commit_snapshot_id)`;
  return `(CASE
    WHEN ${['order_fx_rate_snapshots', 'landed_cost_snapshots', 'actual_cost_ledger_entries', 'margin_actualization_snapshots', 'supply_commitment_snapshots', 'production_requirement_snapshots', 'fulfillment_plan_snapshots'].map(onCurrentSnapshot).join('\n      OR ')}
      THEN 'ORDER_AMENDMENT_ECONOMICS_STARTED'
    WHEN ${orderAlias}.execution_started_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM fulfillment_plan_snapshots AS plan WHERE plan.order_id = ${orderAlias}.id)
      THEN 'ORDER_AMENDMENT_EXECUTION_STARTED'
    ELSE NULL
  END)`;
}
