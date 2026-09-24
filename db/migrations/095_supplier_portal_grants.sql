BEGIN;

-- A supplier portal is not a screen: it is a boundary. Everything a brand knows about a season sits in
-- one database, and the factory it asks for a price must be able to read the part of it addressed to
-- them without being able to read anything else. The grant below is that boundary made explicit — one
-- named person, one supplier, revocable, and issued by someone the brand trusts.
--
-- Two rules are enforced here rather than in a service, because they are the reason the portal is safe
-- to expose at all:
--
--   * a grant may only be issued by an active member of the brand that owns the supplier. Access to a
--     counterparty surface is a decision about the brand's own data, so it is the brand's to make.
--   * a grant may not be held by an active member of that same brand. If the person who awards the
--     business is also the person who answers as the supplier, the portal's promise — that a supplier
--     sees only their own dealings — is still technically true and completely meaningless. This is the
--     same separation the quality module already keeps between the inspector and the approver.
--
-- A grant names an account, not an address. The brand types the person's email, but what is stored is
-- the user id every other relation in the platform uses, so the separation rule below can actually be
-- checked — matching on an email would have compared a string nobody else is keyed by, and quietly
-- passed. The address is kept beside it, because it is what the brand recognises the person by.

CREATE TABLE IF NOT EXISTS supplier_portal_grants (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES organisations(id),
  supplier_code text NOT NULL,
  user_id text NOT NULL REFERENCES auth_users(id),
  invited_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','revoked')),
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL,
  revoked_by text,
  revoked_at timestamptz,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT supplier_portal_grants_supplier_fk
    FOREIGN KEY (brand_id, supplier_code) REFERENCES suppliers (brand_id, supplier_code),
  CONSTRAINT supplier_portal_grants_unique_holder UNIQUE (supplier_code, user_id),
  CONSTRAINT supplier_portal_grants_payload_projection_check CHECK (
    payload ?& ARRAY['id','brandId','supplierCode','userId','invitedEmail','status','grantedBy','grantedAt','version','contactName']
    AND payload ->> 'id' = id
    AND payload ->> 'brandId' = brand_id
    AND payload ->> 'supplierCode' = supplier_code
    AND payload ->> 'userId' = user_id
    AND payload ->> 'invitedEmail' = invited_email
    AND payload ->> 'status' = status
    AND payload ->> 'grantedBy' = granted_by
    AND (payload ->> 'grantedAt')::timestamptz = granted_at
    AND (payload ->> 'version')::integer = version
  ),
  CONSTRAINT supplier_portal_grants_state_check CHECK (
    (status = 'active' AND revoked_at IS NULL AND revoked_by IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  ),
  CONSTRAINT supplier_portal_grants_time_order_check CHECK (
    updated_at >= created_at
    AND granted_at >= created_at
    AND (revoked_at IS NULL OR revoked_at >= granted_at)
  )
);

CREATE INDEX IF NOT EXISTS supplier_portal_grants_holder_idx
  ON supplier_portal_grants (user_id, supplier_code)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS supplier_portal_grants_supplier_idx
  ON supplier_portal_grants (brand_id, supplier_code, status);

CREATE OR REPLACE FUNCTION assert_supplier_portal_grant_separation() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM memberships
     WHERE organisation_id = NEW.brand_id
       AND user_id = NEW.granted_by
       AND status = 'active'
       AND organisation_type = 'brand'
  ) THEN
    RAISE EXCEPTION 'SUPPLIER_PORTAL_GRANTER_NOT_MEMBER: Portal access is granted by a member of the brand that owns the supplier';
  END IF;

  IF NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM memberships
     WHERE organisation_id = NEW.brand_id
       AND user_id = NEW.user_id
       AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'SUPPLIER_PORTAL_HOLDER_IS_BRAND_MEMBER: A member of the brand cannot hold supplier portal access to that brand''s supplier';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS supplier_portal_grants_separation ON supplier_portal_grants;
CREATE TRIGGER supplier_portal_grants_separation
  BEFORE INSERT OR UPDATE ON supplier_portal_grants
  FOR EACH ROW EXECUTE FUNCTION assert_supplier_portal_grant_separation();

COMMIT;
