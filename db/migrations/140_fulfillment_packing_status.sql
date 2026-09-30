BEGIN;

-- Статусы «идёт упаковка» → «товары упакованы» (docs/backlog-not-yet-integrated.md, раздел I:
-- «доставка: ... Состояния «идёт упаковка» → «товары упакованы» — отдельный, ещё не построенный
-- статус-автомат» — сознательно отложено дважды, в `feat/shipment-logistics-detail` и
-- `feat/order-line-shipment-breakdown`, именно как отдельная задача).
--
-- `fulfillment_plan_snapshots.status` зафиксирован строкой `'planned'` навсегда и намеренно не
-- входит в `contentHash` (`src/modules/fulfillment/public.mjs`) — задел под изменяемый статус уже
-- был, просто ничего в него не писало. Но менять сам план значило бы завести вторую причину, по
-- которой неизменяемый снимок меняется помимо своего состава; фактическая упаковка — предвестник
-- отгрузки, а не факт исполнения самого плана, поэтому у неё отдельная маленькая изменяемая
-- таблица, ключ — план, а не сам план.
--
-- Одна запись на план: до первого «начали паковать» строки нет вовсе — отсутствие строки и есть
-- «ещё не начали», третье значение перечисления не требуется. Дальше — только вперёд: 'packing' →
-- 'packed', назад не отматывается (перепланировали бы саму отгрузку, а не статус упаковки).
CREATE TABLE fulfillment_packing_status (
  fulfillment_plan_id text PRIMARY KEY REFERENCES fulfillment_plan_snapshots(id),
  brand_id text NOT NULL REFERENCES organisations(id),
  status text NOT NULL CHECK (status IN ('packing', 'packed')),
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL
);

CREATE INDEX fulfillment_packing_status_brand_idx ON fulfillment_packing_status (brand_id, status);

COMMENT ON TABLE fulfillment_packing_status IS
  'Упаковочный статус плана отгрузки до первого уведомления об отгрузке. Отдельно от fulfillment_plan_snapshots: план — неизменяемый снимок обязательства, упаковка — текущий ход его исполнения. Отсутствие строки значит «ещё не начали»; вперёд только — packing -> packed.';

COMMIT;
