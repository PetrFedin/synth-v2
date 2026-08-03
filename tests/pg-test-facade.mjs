import { createRequire } from 'node:module';

const pg = createRequire(import.meta.url)('pg');

export const Pool = pg.Pool;
export default pg;
