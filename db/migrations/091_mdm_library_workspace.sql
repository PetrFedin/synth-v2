BEGIN;

-- The governed libraries, made visible. Fourteen dictionaries and a hundred entries decided what a
-- colour, a size, a point of measurement or a construction node may be, and not one of them could be
-- looked at from the application: the reference data that the rest of the platform is held to was the
-- only thing nobody could read.
--
-- Two projections, because a list of libraries and the entries inside one are read at different
-- moments and at very different sizes.

CREATE OR REPLACE VIEW mdm_library_workspace AS
SELECT
  dictionary.id,
  dictionary.code,
  jsonb_build_object(
    'id', dictionary.id,
    'code', dictionary.code,
    'nameRu', dictionary.names ->> 'ru',
    'nameEn', dictionary.names ->> 'en',
    'dataClass', dictionary.data_class,
    'scopeModel', dictionary.scope_model,
    'status', dictionary.status,
    'approvalRequired', dictionary.approval_required,
    'effectiveDated', dictionary.effective_dated,
    'entryCount', COALESCE(entries.total, 0),
    'activeEntryCount', COALESCE(entries.active, 0),
    'updatedAt', dictionary.updated_at
  ) AS payload
FROM mdm_dictionaries dictionary
LEFT JOIN LATERAL (
  SELECT COUNT(*)::integer AS total,
         COUNT(*) FILTER (WHERE entry.status = 'active')::integer AS active
  FROM mdm_entries entry
  WHERE entry.dictionary_id = dictionary.id
) entries ON true;

COMMENT ON VIEW mdm_library_workspace IS
  'The governed libraries with how many entries each holds. Reference data the platform enforces, made readable.';

CREATE OR REPLACE VIEW mdm_library_entry_workspace AS
SELECT
  entry.id,
  dictionary.code AS dictionary_code,
  jsonb_build_object(
    'id', entry.id,
    'dictionaryCode', dictionary.code,
    'code', entry.code,
    'nameRu', entry.translations ->> 'ru',
    'nameEn', entry.translations ->> 'en',
    'descriptionRu', entry.attributes ->> 'descriptionRu',
    'descriptionEn', entry.attributes ->> 'descriptionEn',
    'status', entry.status,
    'version', entry.version,
    'parentCode', parent.code,
    -- The governance bookkeeping is kept out of the way: what a reader wants from a library entry is
    -- what it means, not which dataset version last touched it.
    'attributes', entry.attributes - 'descriptionRu' - 'descriptionEn' - 'source'
                    - 'change_reason' - 'datasetVersion' - 'operationalProfile',
    'validFrom', entry.valid_from,
    'validTo', entry.valid_to
  ) AS payload
FROM mdm_entries entry
JOIN mdm_dictionaries dictionary ON dictionary.id = entry.dictionary_id
LEFT JOIN mdm_entries parent ON parent.id = entry.parent_id;

COMMENT ON VIEW mdm_library_entry_workspace IS
  'Entries of a governed library, with the governance bookkeeping stripped out of the attributes a reader sees.';

COMMIT;
