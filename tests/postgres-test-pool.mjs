import pg from 'pg';

export function createPostgresTestPool(options) {
  if (!pg || typeof pg.Pool !== 'function') {
    throw new TypeError('The PostgreSQL driver does not expose Pool through its default CommonJS export');
  }
  return new pg.Pool(options);
}

export function assertPostgresTestDriver() {
  return Object.freeze({
    poolConstructor: pg.Pool.name,
  });
}
