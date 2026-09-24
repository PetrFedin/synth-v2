import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { calculateMoneyPercentage, roundAwayFromZero } from '../src/core/money.mjs';

// Половины, **точно представимые** в двоичной плавающей точке: только на них можно честно спросить
// «как округляет JS и как округляет PostgreSQL» и получить ответ про правило, а не про
// представление. Десятичная половина вида 0,00005 в double не существует вовсе — ближайшее к ней
// число лежит чуть ниже, и любой язык округлит его вниз, а PostgreSQL, читающий десятичную строку
// точно, — вверх. **Это расхождение правилом округления не лечится**, и делать вид, что лечится,
// значило бы написать тест, который проверяет удачу. Лечится оно только целочисленной арифметикой:
// доля маржи считается в BigInt (`calculateMoneyPercentage`) и потому совпадает с базой всегда —
// это и проверяется ниже отдельно.
const HALVES = Object.freeze([
  -1755.84375, 1755.84375, -0.03125, 0.03125, -0.09375, 0.09375,
  -12.34375, 12.34375, -0.15625, 0.15625, -999.96875, 999.96875,
]);

test('the rounding rule is PostgreSQL’s: half away from zero, at either sign', () => {
  // `Math.round` округляет половину к плюс бесконечности, то есть у отрицательных — **к нулю**.
  // Пока числа положительные, разницы нет; на убыточной марже, стоимостной коррекции или кредите
  // поставщика она появляется — и там же её пересчитывает триггер целостности.
  assert.equal(roundAwayFromZero(-1755.84375), -1755.8438);
  assert.equal(Math.round(-1755.84375 * 10_000) / 10_000, -1755.8437, 'именно это и расходилось');
  // Минус ноль отличим в сравнении и неотличим в JSON, поэтому приводится к нулю.
  assert.ok(Object.is(roundAwayFromZero(-0.000001), 0));
});

const connectionString = process.env.POSTGRES_TEST_URL;
test('every rounding this platform does agrees with the database that re-checks it', { skip: connectionString ? false : 'POSTGRES_TEST_URL is not set' }, async () => {
  const pool = new pg.Pool({ connectionString, max: 2 });
  try {
    // Сумма: JS против `round(v, 4)`.
    const rounded = await pool.query(
      'SELECT value, round(value, 4) AS expected FROM unnest($1::numeric[]) AS value',
      [HALVES.map((value) => value.toFixed(5))],
    );
    for (const row of rounded.rows) {
      assert.equal(roundAwayFromZero(Number(row.value)), Number(row.expected), `round(${row.value}, 4)`);
    }

    // Доля: JS против того самого выражения, которым её пересчитывает триггер целостности маржи.
    const pairs = [
      [-1755.8438, 3200], [-1097.4010, 2000], [-2, 3], [1, 3], [-1, 3],
      [-0.0001, 3], [-5, 16], [-16, 32000], [2.5, 8], [-2.5, 8],
    ];
    for (const [margin, revenue] of pairs) {
      const { rows } = await pool.query(
        'SELECT round(($1::numeric(20,4) / $2::numeric(20,4)) * 100, 4) AS expected',
        [margin.toFixed(4), revenue.toFixed(4)],
      );
      assert.equal(
        calculateMoneyPercentage(margin, revenue),
        Number(rows[0].expected),
        `percent(${margin}, ${revenue})`,
      );
    }
  } finally {
    await pool.end();
  }
});
