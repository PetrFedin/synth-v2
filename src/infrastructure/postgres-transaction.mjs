const SECONDARY_ERROR_FIELDS = Object.freeze({
  rollback: 'rollbackError',
  release: 'releaseError',
});

export async function withPostgresTransaction(pool, work, {
  createView = (client) => client,
  begin = 'BEGIN',
} = {}) {
  if (!pool || typeof pool.connect !== 'function') {
    throw new TypeError('PostgreSQL pool with connect() is required');
  }
  if (typeof work !== 'function') {
    throw new TypeError('PostgreSQL transaction work must be a function');
  }
  if (typeof createView !== 'function') {
    throw new TypeError('PostgreSQL transaction createView must be a function');
  }
  if (typeof begin !== 'string' || begin.length === 0) {
    throw new TypeError('PostgreSQL transaction begin statement is required');
  }

  const client = await pool.connect();
  let primaryError;

  try {
    await client.query(begin);
    const result = await work(createView(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    primaryError = error;
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      attachSecondaryError(error, SECONDARY_ERROR_FIELDS.rollback, rollbackError);
    }
    throw error;
  } finally {
    try {
      client.release();
    } catch (releaseError) {
      if (primaryError !== undefined) {
        attachSecondaryError(primaryError, SECONDARY_ERROR_FIELDS.release, releaseError);
      } else {
        throw releaseError;
      }
    }
  }
}

function attachSecondaryError(primaryError, field, secondaryError) {
  if (
    (typeof primaryError !== 'object' && typeof primaryError !== 'function')
    || primaryError === null
    || !Object.isExtensible(primaryError)
  ) return;

  try {
    Object.defineProperty(primaryError, field, {
      value: secondaryError,
      enumerable: false,
      configurable: true,
      writable: false,
    });
  } catch {
    // The primary error must always win, including for frozen or exotic error objects.
  }
}
