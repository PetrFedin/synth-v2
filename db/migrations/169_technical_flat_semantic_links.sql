BEGIN;

ALTER TABLE technical_drawing_objects
  ADD COLUMN garment_node_id text NULL
  REFERENCES product_engineering_garment_nodes(id) ON DELETE RESTRICT;

ALTER TABLE technical_drawing_objects
  DROP CONSTRAINT technical_drawing_objects_object_type_check;

ALTER TABLE technical_drawing_objects
  ADD CONSTRAINT technical_drawing_objects_object_type_check
  CHECK (object_type IN (
    'outline','panel','seam','stitch','pocket','closure','collar','cuff','trim',
    'measurement_anchor','construction_callout','dart','pleat','hem','grainline',
    'foldline','notch','button','buttonhole','zipper','annotation'
  ));

CREATE INDEX technical_drawing_objects_garment_node_idx
  ON technical_drawing_objects (garment_node_id)
  WHERE garment_node_id IS NOT NULL;

COMMENT ON COLUMN technical_drawing_objects.garment_node_id IS
  'Optional exact link from a technical-flat primitive to the reviewed/proposed garment ontology node that gives it engineering meaning.';

COMMIT;
