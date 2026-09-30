BEGIN;

-- Изменения подтверждённого заказа (docs/backlog-not-yet-integrated.md, раздел 3: «операции
-- изменения подтверждённого заказа нет»; docs/joor-retailer-cabinet-complete-map.md §64.6-64.8).
-- После `attached` у заказа был только один путь — отмена целиком (`cancelAttachedOrder`);
-- изменить количество одной строки было нечем, кроме как отменить весь заказ и оформить заново.
--
-- Это — предложение и ответ на него, а не тихая перезапись количества в строке заказа: заказ,
-- его `orderCommitSnapshot` и резервирования склада построены вокруг зафиксированных количеств, и
-- автоматически сдвигать их вслед за принятой правкой значило бы завести вторую, несогласованную
-- причину изменения того, что уже зафиксировано этим снимком. Эта таблица закрывает более узкий,
-- но настоящий пробел из карты JOOR: сам факт предложения, обоснование, коммерческое влияние и
-- ответ другой стороны нигде не фиксировались вовсе. Применение принятой правки к количеству —
-- отдельный, сознательно следующий шаг.
--
-- Предлагает одна сторона сделки, отвечает — другая: `responded_by`/`responded_organisation_id`
-- заполняются только переходом в `accepted`/`rejected`, и не той же организацией, что предложила.
CREATE TABLE order_amendments (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders (id),
  line_no integer NOT NULL CHECK (line_no >= 1),
  current_quantity integer NOT NULL CHECK (current_quantity > 0),
  proposed_quantity integer NOT NULL CHECK (proposed_quantity > 0),
  delta_amount numeric(20, 4) NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'accepted', 'rejected')),
  response_reason text NULL,
  proposed_organisation_id text NOT NULL REFERENCES organisations (id),
  proposed_by text NOT NULL,
  proposed_at timestamptz NOT NULL,
  responded_organisation_id text NULL REFERENCES organisations (id),
  responded_by text NULL,
  responded_at timestamptz NULL,
  payload jsonb NOT NULL
);

CREATE INDEX order_amendments_order_idx ON order_amendments (order_id, line_no);

-- Одна незакрытая правка на строку одновременно — вторая до ответа на первую спрашивала бы, какая
-- из двух в итоге считается предложенной ценой обсуждения.
CREATE UNIQUE INDEX order_amendments_open_per_line_uidx ON order_amendments (order_id, line_no) WHERE status = 'proposed';

COMMENT ON TABLE order_amendments IS
  'Предложение изменить количество строки уже подтверждённого заказа и ответ на него. Не меняет строку заказа автоматически — фиксирует факт предложения, причину, коммерческое влияние и ответ другой стороны.';

COMMIT;
