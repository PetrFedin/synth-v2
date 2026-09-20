BEGIN;

-- Where a material goes, and which one is the principal.
--
-- Two columns Omnidata's bill of materials carries and ours did not, both of which are in the
-- printed tech pack a factory actually works from:
--
--   * Placement — "Рукава, планка, налокотник, воротник рубашки". Which parts of the garment this
--     material is used on. Without it a bill is a shopping list: it says a shell fabric and a
--     lining are needed and leaves the factory to guess which goes where, which is the single
--     cheapest question to answer in a document and the most expensive one to answer by e-mail
--     three weeks later.
--
--   * Main — of the several fabrics on a garment, one is the fabric. The costing does not care;
--     everything downstream of the costing does. A care label, a customs declaration and a
--     composition statement all name the principal material of their kind, and a bill that cannot
--     say which one it is makes three people pick for themselves.
--
-- The rule underneath "main" is what makes it worth a column rather than a note: at most one main
-- line per material type in a bill. Two principal fabrics is not a strong opinion, it is an
-- unanswered question, and the answer is what the label prints. Nothing forces a bill to name one —
-- a bill still being written has not decided yet — but it cannot name two.
--
-- Both columns are projected from the line payload, so the row and the stored line cannot drift
-- apart. Existing lines carry neither, and the checks pass for them unchanged: no placement is
-- NULL on both sides, and no main is false on both.

ALTER TABLE bom_lines ADD COLUMN IF NOT EXISTS placement text;
ALTER TABLE bom_lines ADD COLUMN IF NOT EXISTS is_main boolean NOT NULL DEFAULT false;

ALTER TABLE bom_lines DROP CONSTRAINT IF EXISTS bom_lines_placement_length_check;
ALTER TABLE bom_lines ADD CONSTRAINT bom_lines_placement_length_check
  CHECK (placement IS NULL OR (length(btrim(placement)) BETWEEN 2 AND 400 AND placement = btrim(placement)));

ALTER TABLE bom_lines DROP CONSTRAINT IF EXISTS bom_lines_placement_projection_check;
ALTER TABLE bom_lines ADD CONSTRAINT bom_lines_placement_projection_check
  CHECK (placement IS NOT DISTINCT FROM NULLIF(payload ->> 'placement', ''));

ALTER TABLE bom_lines DROP CONSTRAINT IF EXISTS bom_lines_is_main_projection_check;
ALTER TABLE bom_lines ADD CONSTRAINT bom_lines_is_main_projection_check
  CHECK (is_main = COALESCE((payload ->> 'isMain')::boolean, false));

-- One principal material per kind, per bill. A partial index says exactly that and says it in the
-- one place that cannot be bypassed.
DROP INDEX IF EXISTS bom_lines_single_main_per_type_idx;
CREATE UNIQUE INDEX bom_lines_single_main_per_type_idx
  ON bom_lines (bom_id, material_type)
  WHERE is_main;

COMMENT ON COLUMN bom_lines.placement IS
  'Where on the garment this material is used, as the tech pack prints it. Free text because a placement is a sentence about a garment, not a code.';
COMMENT ON COLUMN bom_lines.is_main IS
  'This line is the principal material of its kind in this bill. At most one per material type, enforced by bom_lines_single_main_per_type_idx; a bill still being written may name none.';

COMMIT;
