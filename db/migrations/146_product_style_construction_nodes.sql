BEGIN;

-- Технологические узлы на продукте (docs/backlog-not-yet-integrated.md, раздел C: «технологические
-- узлы на продукте (справочник есть, привязки к изделию нет)»; docs/omnidata-screens-gap-analysis.md,
-- пункт 11) — справочник `design.construction_node` заведён и используется в последовательности
-- операций (BOL), но ни разу не был привязываем к самому стилю: какие из уже каталогизированных
-- узлов (втачной воротник, застёжка-молния и т. п.) вообще применимы к этому изделию.
--
-- Та же лёгкая, пополняемая без жизненного цикла доска, что и `product_style_references` (миграция
-- 144): запись — это факт «этот узел применим к этому стилю» с порядком показа, а не черновик или
-- статус. Привязана к самому стилю, а не к его версии, по той же причине — конструктивная
-- особенность модели переживает смену версий. В отличие от референса, здесь запись ссылается на
-- управляемый (governed) справочник MDM, поэтому несёт версию записи справочника, а не просто текст.
CREATE TABLE product_style_construction_nodes (
  id text PRIMARY KEY,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  construction_node_entry_id text NOT NULL,
  construction_node_entry_version integer NOT NULL CHECK (construction_node_entry_version > 0),
  note text NULL CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 1000),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  -- Один и тот же узел не добавляется на доску дважды; порядок показа тоже не делится на двоих.
  -- Named explicitly (rather than left to Postgres' auto-generated, truncation-prone default) so the
  -- store can tell the two conflicts apart by constraint name and raise the right domain error.
  CONSTRAINT product_style_construction_nodes_node_uq UNIQUE (style_id, construction_node_entry_id),
  CONSTRAINT product_style_construction_nodes_order_uq UNIQUE (style_id, sort_order),
  CONSTRAINT product_style_construction_nodes_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles (id, brand_id)
);

CREATE INDEX product_style_construction_nodes_style_order_idx
  ON product_style_construction_nodes (style_id, sort_order);

COMMENT ON TABLE product_style_construction_nodes IS
  'Доска технологических узлов, применимых к стилю бренда — ссылки на управляемый справочник design.construction_node. Пополняемая доска без жизненного цикла, тем же приёмом, что и product_style_references.';

COMMIT;
