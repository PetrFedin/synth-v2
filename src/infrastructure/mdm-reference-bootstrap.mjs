import { invariant } from '../core/errors.mjs';

const OWNER = 'system:mdm-data-governance';
const STEWARD = 'system:mdm-data-steward';

export async function bootstrapMdmReference({ pool, datasets, actorId = 'system:mdm-bootstrap' } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'MDM_BOOTSTRAP_POOL_REQUIRED', 'PostgreSQL pool is required');
  invariant(Array.isArray(datasets) && datasets.length > 0, 'MDM_BOOTSTRAP_DATASETS_REQUIRED', 'Operational MDM datasets are required');
  invariant(typeof actorId === 'string' && actorId.trim(), 'MDM_BOOTSTRAP_ACTOR_REQUIRED', 'Bootstrap actor id is required');

  const client = await pool.connect();
  const result = { insertedDictionaries: 0, existingDictionaries: 0, evolvedDictionaries: 0, insertedEntries: 0, existingEntries: 0, evolvedEntries: 0 };
  try {
    await client.query('BEGIN');
    for (const dataset of datasets) {
      assertDataset(dataset);
      for (const dictionary of [...dataset.dictionaries].sort((left, right) => left.code.localeCompare(right.code))) {
        const state = await ensureDictionary(client, dataset, dictionary, actorId);
        result[state] += 1;
      }
    }
    for (const dataset of datasets) {
      for (const dictionary of [...dataset.dictionaries].sort((left, right) => left.code.localeCompare(right.code))) {
        const entries = [...dictionary.entries].sort((left, right) => left.code.localeCompare(right.code));
        const idsByCode = new Map(entries.map((entry) => [entry.code, entry.id]));
        for (const entry of entries) {
          const state = await ensureEntry(client, dataset, dictionary, entry, idsByCode, actorId);
          result[state] += 1;
        }
      }
    }
    await client.query('COMMIT');
    return Object.freeze({ ...result });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function assertDataset(dataset) {
  invariant(dataset?.profile === 'RU_FASHION_CORE', 'MDM_BOOTSTRAP_PROFILE_INVALID', 'Only the governed RU_FASHION_CORE profile can be bootstrapped by this command');
  invariant(Array.isArray(dataset.dictionaries) && dataset.dictionaries.length > 0, 'MDM_BOOTSTRAP_DATASET_INVALID', 'Dataset dictionaries are required');
  invariant(dataset.source?.system, 'MDM_BOOTSTRAP_SOURCE_REQUIRED', 'Dataset source system is required');
}

async function ensureDictionary(client, dataset, dictionary, actorId) {
  const existing = await client.query(
    `SELECT * FROM mdm_dictionaries
      WHERE id = $1 OR (tenant_id IS NULL AND code = $2)
      ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END
      LIMIT 1
      FOR UPDATE`,
    [dictionary.id, dictionary.code],
  );
  const current = existing.rows[0];
  if (current) {
    invariant(current.id === dictionary.id && current.code === dictionary.code, 'MDM_BOOTSTRAP_DICTIONARY_IDENTITY_CONFLICT', 'Existing MDM dictionary id/code conflicts with source-controlled operational master', { expectedId: dictionary.id, expectedCode: dictionary.code, actualId: current.id, actualCode: current.code });
    if (current.version > 1) return 'evolvedDictionaries';
    assertDictionaryVersionOne(current, dataset, dictionary);
    return 'existingDictionaries';
  }

  const at = dataset.source.retrieved_at;
  await client.query(
    `INSERT INTO mdm_dictionaries
       (id, tenant_id, code, names, data_class, scope_model, hierarchy_enabled, effective_dated,
        approval_required, status, owner_actor_id, steward_actor_id, source_system, attributes,
        version, created_at, created_by, updated_at, updated_by)
     VALUES ($1, NULL, $2, $3::jsonb, $4, $5, $6, $7, $8, 'active', $9, $10, $11, $12::jsonb, 1, $13, $14, $13, $14)`,
    [
      dictionary.id,
      dictionary.code,
      JSON.stringify(dictionary.name),
      dictionary.data_class,
      dictionary.scope_model,
      Boolean(dictionary.hierarchy_enabled),
      Boolean(dictionary.effective_dated),
      Boolean(dictionary.approval_required),
      OWNER,
      STEWARD,
      dataset.source.system,
      JSON.stringify({
        description: dictionary.description,
        operationalProfile: dataset.profile,
        markets: dataset.markets,
        languages: dataset.languages,
        datasetVersion: dataset.dataset_version,
        change_reason: 'initial source-controlled operational reference bootstrap',
      }),
      at,
      actorId,
    ],
  );
  return 'insertedDictionaries';
}

function assertDictionaryVersionOne(current, dataset, dictionary) {
  const expected = {
    names: dictionary.name,
    data_class: dictionary.data_class,
    scope_model: dictionary.scope_model,
    hierarchy_enabled: Boolean(dictionary.hierarchy_enabled),
    effective_dated: Boolean(dictionary.effective_dated),
    approval_required: Boolean(dictionary.approval_required),
    status: 'active',
    source_system: dataset.source.system,
  };
  for (const [field, value] of Object.entries(expected)) {
    const actual = current[field];
    const matches = typeof value === 'object' ? canonical(actual) === canonical(value) : actual === value;
    invariant(matches, 'MDM_BOOTSTRAP_DICTIONARY_DRIFT', 'Version 1 MDM dictionary differs from the source-controlled operational master', { dictionaryId: dictionary.id, field, expected: value, actual });
  }
}

async function ensureEntry(client, dataset, dictionary, entry, idsByCode, actorId) {
  const existing = await client.query(
    `SELECT * FROM mdm_entries
      WHERE id = $1 OR (dictionary_id = $2 AND tenant_id IS NULL AND code = $3)
      ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END
      LIMIT 1
      FOR UPDATE`,
    [entry.id, dictionary.id, entry.code],
  );
  const current = existing.rows[0];
  const parentId = entry.parent_code ? idsByCode.get(entry.parent_code) : null;
  invariant(!entry.parent_code || parentId, 'MDM_BOOTSTRAP_PARENT_NOT_FOUND', 'Operational MDM parent_code must resolve inside the same dataset dictionary', { dictionaryCode: dictionary.code, entryCode: entry.code, parentCode: entry.parent_code });
  if (current) {
    invariant(current.id === entry.id && current.dictionary_id === dictionary.id && current.code === entry.code, 'MDM_BOOTSTRAP_ENTRY_IDENTITY_CONFLICT', 'Existing MDM entry identity conflicts with source-controlled operational master', { expectedId: entry.id, dictionaryId: dictionary.id, expectedCode: entry.code, actualId: current.id, actualDictionaryId: current.dictionary_id, actualCode: current.code });
    if (current.version > 1) return 'evolvedEntries';
    assertEntryVersionOne(current, dataset, dictionary, entry, parentId);
    return 'existingEntries';
  }

  const status = runtimeStatus(entry.status);
  const translations = { ru: entry.name_ru, en: entry.name_en };
  const at = dataset.source.retrieved_at;
  await client.query(
    `INSERT INTO mdm_entries
       (id, dictionary_id, tenant_id, code, name, translations, aliases, parent_id, status,
        valid_from, valid_to, version, source_system, external_ids, owner_actor_id, steward_actor_id,
        approval_status, attributes, created_at, created_by, updated_at, updated_by)
     VALUES ($1, $2, NULL, $3, $4, $5::jsonb, '[]'::jsonb, $6, $7, $8, $9, 1, $10, '{}'::jsonb,
             $11, $12, $13, $14::jsonb, $15, $16, $15, $16)`,
    [
      entry.id,
      dictionary.id,
      entry.code,
      entry.name_ru,
      JSON.stringify(translations),
      parentId,
      status,
      entry.effective_from,
      entry.effective_to ?? null,
      dataset.source.system,
      OWNER,
      STEWARD,
      dictionary.approval_required ? 'approved' : 'not_required',
      JSON.stringify({
        ...entry.attributes,
        descriptionRu: entry.description_ru ?? '',
        descriptionEn: entry.description_en ?? '',
        source: entry.source,
        operationalProfile: dataset.profile,
        datasetVersion: dataset.dataset_version,
        change_reason: 'initial source-controlled operational reference bootstrap',
      }),
      at,
      actorId,
    ],
  );
  return 'insertedEntries';
}

function assertEntryVersionOne(current, dataset, dictionary, entry, parentId) {
  const expected = {
    dictionary_id: dictionary.id,
    code: entry.code,
    name: entry.name_ru,
    translations: { ru: entry.name_ru, en: entry.name_en },
    parent_id: parentId,
    status: runtimeStatus(entry.status),
    source_system: dataset.source.system,
    approval_status: dictionary.approval_required ? 'approved' : 'not_required',
  };
  for (const [field, value] of Object.entries(expected)) {
    const actual = current[field];
    const matches = typeof value === 'object' && value !== null ? canonical(actual) === canonical(value) : actual === value;
    invariant(matches, 'MDM_BOOTSTRAP_ENTRY_DRIFT', 'Version 1 MDM entry differs from the source-controlled operational master', { entryId: entry.id, field, expected: value, actual });
  }
  const validFrom = current.valid_from ? new Date(current.valid_from).toISOString() : null;
  const validTo = current.valid_to ? new Date(current.valid_to).toISOString() : null;
  invariant(validFrom === entry.effective_from && validTo === (entry.effective_to ?? null), 'MDM_BOOTSTRAP_ENTRY_DRIFT', 'Version 1 MDM entry effective dates differ from the source-controlled operational master', { entryId: entry.id, expectedValidFrom: entry.effective_from, actualValidFrom: validFrom, expectedValidTo: entry.effective_to ?? null, actualValidTo: validTo });
}

function runtimeStatus(status) {
  if (status === 'active') return 'active';
  if (status === 'draft') return 'draft';
  if (status === 'deprecated') return 'inactive';
  if (status === 'retired') return 'archived';
  throw new Error(`Unsupported operational MDM status ${status}`);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
