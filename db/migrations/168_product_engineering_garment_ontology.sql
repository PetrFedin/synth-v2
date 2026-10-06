BEGIN;

CREATE TABLE product_engineering_garment_graphs (
  id text PRIMARY KEY,
  analysis_run_id text NOT NULL REFERENCES product_engineering_analysis_runs(id),
  brand_id text NOT NULL,
  style_id text NOT NULL,
  schema_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','reviewed','superseded')),
  content_hash text NULL CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  node_count integer NOT NULL DEFAULT 0 CHECK (node_count >= 0),
  edge_count integer NOT NULL DEFAULT 0 CHECK (edge_count >= 0),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  reviewed_at timestamptz NULL,
  reviewed_by text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT garment_graph_style_fk FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id),
  CHECK (
    (status='draft' AND content_hash IS NULL AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR
    (status<>'draft' AND content_hash IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  )
);

CREATE INDEX product_engineering_garment_graph_style_idx
  ON product_engineering_garment_graphs (style_id, created_at DESC, id DESC);

CREATE TABLE product_engineering_garment_nodes (
  id text PRIMARY KEY,
  graph_id text NOT NULL REFERENCES product_engineering_garment_graphs(id) ON DELETE RESTRICT,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  node_type text NOT NULL CHECK (node_type IN (
    'garment','component','panel','seam','stitch','closure','pocket','collar','cuff','trim',
    'material_role','measurement_anchor','construction_node','operation_candidate'
  )),
  semantic_code text NULL,
  label text NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes)='object'),
  confidence numeric(5,4) NULL CHECK (confidence IS NULL OR (confidence>=0 AND confidence<=1)),
  finding_id text NULL REFERENCES product_engineering_findings(id),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  CONSTRAINT garment_node_style_fk FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX product_engineering_garment_node_graph_idx
  ON product_engineering_garment_nodes (graph_id, node_type, id);

CREATE TABLE product_engineering_garment_edges (
  id text PRIMARY KEY,
  graph_id text NOT NULL REFERENCES product_engineering_garment_graphs(id) ON DELETE RESTRICT,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  from_node_id text NOT NULL REFERENCES product_engineering_garment_nodes(id) ON DELETE RESTRICT,
  to_node_id text NOT NULL REFERENCES product_engineering_garment_nodes(id) ON DELETE RESTRICT,
  relation text NOT NULL CHECK (relation IN (
    'contains','part_of','connects_to','located_on','constructed_by','stitched_by',
    'measured_by','materialized_by','operation_candidate','supports'
  )),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes)='object'),
  confidence numeric(5,4) NULL CHECK (confidence IS NULL OR (confidence>=0 AND confidence<=1)),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  CONSTRAINT garment_edge_no_self CHECK (from_node_id<>to_node_id),
  CONSTRAINT garment_edge_style_fk FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX product_engineering_garment_edge_graph_idx
  ON product_engineering_garment_edges (graph_id, relation, id);

COMMENT ON TABLE product_engineering_garment_graphs IS
  'Evidence-derived semantic garment graph used by technical drawing/POM/BOM/construction assistants; it is review evidence, not canonical Product/BOM/Measurement truth.';
COMMENT ON TABLE product_engineering_garment_nodes IS
  'Shared semantic nodes keep technical flat, POM, BOM and construction proposals aligned to the same interpreted garment structure.';

COMMIT;
