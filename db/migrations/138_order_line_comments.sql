BEGIN;

-- Комментарий поставщика и комментарий заказчика на строке заказа.
--
-- `orders.payload` и `order_commit_snapshots.payload` неизменяемы — их строки заморожены хешем
-- содержимого (`order-commit/public.mjs`) и никакое новое поле в них не добавить без нарушения
-- этой неизменности. Комментарий, наоборот, ровно то, что меняется: сторона правит его до тех
-- пор, пока не сформулирует то, что хотела сказать, и это не решение о заказе, а заметка при нём.
--
-- Поэтому — отдельная маленькая изменяемая таблица, ключ (order_id, line_no, side), а не журнал.
-- «supplier» — сторона бренда, «customer» — сторона магазина; какая из них пишет, определяет
-- сервис по членству актёра в brand_id/shop_id заказа, а не тело запроса — тем же приёмом, что уже
-- проверяет `order-fulfillment-view-service.mjs`. Один комментарий на сторону на строку, не тред:
-- новая запись целиком заменяет предыдущую (ON CONFLICT DO UPDATE), а пустое тело удаляет её —
-- бэклог просил «комментарий», не историю комментариев.
CREATE TABLE IF NOT EXISTS order_line_comments (
  order_id text NOT NULL REFERENCES orders(id),
  line_no integer NOT NULL CHECK (line_no > 0),
  side text NOT NULL CHECK (side IN ('supplier', 'customer')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  commented_at timestamptz NOT NULL,
  commented_by text NOT NULL,
  PRIMARY KEY (order_id, line_no, side)
);

COMMENT ON TABLE order_line_comments IS
  'Комментарий поставщика (бренд) и комментарий заказчика (магазин) на строке заказа — одна изменяемая заметка на сторону на строку, не журнал. Сторона определяется по членству актёра в организациях заказа, не принимается от клиента.';

COMMIT;
