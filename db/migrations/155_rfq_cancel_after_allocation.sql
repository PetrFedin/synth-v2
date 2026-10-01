BEGIN;

-- Q-02. Отмена производственного заказа не освобождала источник: RFQ оставался в статусе
-- allocated, а его нельзя было отменить (состояние cancelled требовало allocated_at IS NULL), и
-- частичный уникальный индекс sourcing_rfqs_active_production_requirement_line_uidx (status <>
-- 'cancelled') навсегда занимал строку утверждённого спроса. Новый RFQ на неё завести было
-- нельзя. Теперь RFQ, чей заказ отменён, переходит в cancelled и сохраняет данные распределения
-- (allocated_at, allocation) как след того, что было решено до отмены.
ALTER TABLE sourcing_rfqs DROP CONSTRAINT sourcing_rfqs_state_check;
ALTER TABLE sourcing_rfqs ADD CONSTRAINT sourcing_rfqs_state_check CHECK (
    (status = 'draft' AND issued_at IS NULL AND awarded_at IS NULL AND allocated_at IS NULL AND cancelled_at IS NULL AND selected_supplier_code IS NULL)
    OR (status IN ('issued','quoted') AND issued_at IS NOT NULL AND awarded_at IS NULL AND allocated_at IS NULL AND cancelled_at IS NULL AND selected_supplier_code IS NULL)
    OR (status = 'awarded' AND issued_at IS NOT NULL AND awarded_at IS NOT NULL AND allocated_at IS NULL AND cancelled_at IS NULL AND selected_supplier_code IS NOT NULL AND payload -> 'award' <> 'null'::jsonb)
    OR (status = 'allocated' AND issued_at IS NOT NULL AND awarded_at IS NOT NULL AND allocated_at IS NOT NULL AND cancelled_at IS NULL AND selected_supplier_code IS NOT NULL AND payload -> 'allocation' <> 'null'::jsonb)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL
        AND (allocated_at IS NULL OR (allocated_at <= cancelled_at AND payload -> 'allocation' <> 'null'::jsonb)))
);

COMMIT;
