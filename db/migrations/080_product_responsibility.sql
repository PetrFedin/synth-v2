BEGIN;

-- Who answers for a style. Every register in this industry is read by asking "which of these are
-- mine", and until now nothing on a style could answer that: a product carried no people at all.
-- Responsibility is its own relation so it can be filtered like any other attribute, and so that
-- handing a desk over is a recorded event rather than an edited text field.

CREATE TABLE IF NOT EXISTS product_style_responsibilities (
  id text PRIMARY KEY,
  style_id text NOT NULL,
  brand_id text NOT NULL REFERENCES organisations(id),
  role text NOT NULL CHECK (role IN ('designer', 'product_manager', 'buyer', 'fabric_manager', 'technologist')),
  user_id text NOT NULL REFERENCES auth_users(id),
  assigned_at timestamptz NOT NULL,
  assigned_by text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  -- The same person is not assigned to the same desk twice; two designers on one style is allowed.
  UNIQUE (style_id, role, user_id),
  CONSTRAINT product_style_responsibilities_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles(id, brand_id)
);

CREATE INDEX IF NOT EXISTS product_style_responsibilities_style_idx
  ON product_style_responsibilities (style_id, role);
CREATE INDEX IF NOT EXISTS product_style_responsibilities_user_idx
  ON product_style_responsibilities (brand_id, user_id, role);

-- The brand is the unit of access in this platform, so responsibility for a style cannot be handed
-- to someone outside the brand that owns it. Enforced here as well as in the domain module, because
-- a person who is not a member must never end up holding a desk on another company's product.
CREATE OR REPLACE FUNCTION assert_product_responsibility_membership() RETURNS trigger AS $$
DECLARE
  membership_status text;
BEGIN
  SELECT status INTO membership_status
    FROM memberships
   WHERE organisation_id = NEW.brand_id
     AND user_id = NEW.user_id;

  IF membership_status IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_RESPONSIBILITY_NOT_A_MEMBER: % is not a member of %', NEW.user_id, NEW.brand_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF membership_status <> 'active' THEN
    RAISE EXCEPTION 'PRODUCT_RESPONSIBILITY_MEMBERSHIP_INACTIVE: membership of % in % is %', NEW.user_id, NEW.brand_id, membership_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_style_responsibilities_membership ON product_style_responsibilities;
CREATE TRIGGER product_style_responsibilities_membership
  BEFORE INSERT OR UPDATE ON product_style_responsibilities
  FOR EACH ROW EXECUTE FUNCTION assert_product_responsibility_membership();

COMMIT;
