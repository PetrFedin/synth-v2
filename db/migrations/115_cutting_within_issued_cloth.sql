BEGIN;

-- С рулона нельзя настелить больше, чем в партию выдано.
--
-- Миграция 114 связала настил с выдачами: ткань берётся только из рулонов, выданных в те партии,
-- которые этот настил раскраивает, и снято ровно столько, сколько настелено. Обоих правил мало.
-- Ничто не мешало настелить с одного рулона 400 метров трижды, и запись сказала бы, что из шестисот
-- метров получилось тысяча двести.
--
-- Складывается всё, что уже настелено с этого рулона, кроме отменённых настилов: отменённый настил
-- не состоялся, и держать за ним метраж значило бы терять ткань на бумаге. Отмена только
-- освобождает, поэтому проверять её отдельно не нужно — она не может нарушить это правило.

CREATE OR REPLACE FUNCTION assert_spread_stays_within_issued_cloth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  issued numeric(14, 4);
  spread_total numeric(14, 4);
  lot_name text;
BEGIN
  SELECT issued_quantity, lot_reference INTO issued, lot_name FROM material_lots WHERE id = NEW.lot_id;

  SELECT COALESCE(sum(spread_lot.quantity), 0) INTO spread_total
    FROM cutting_spread_lots AS spread_lot
    JOIN cutting_spreads AS spread ON spread.id = spread_lot.spread_id
   WHERE spread_lot.lot_id = NEW.lot_id
     AND spread.status <> 'cancelled';

  IF spread_total > issued THEN
    RAISE EXCEPTION 'CUTTING_EXCEEDS_ISSUED_CLOTH: % laid from lot % but only % was issued into production', spread_total, lot_name, issued;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS cutting_spread_lots_within_issued ON cutting_spread_lots;
CREATE CONSTRAINT TRIGGER cutting_spread_lots_within_issued
  AFTER INSERT OR UPDATE ON cutting_spread_lots
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_spread_stays_within_issued_cloth();

COMMIT;
