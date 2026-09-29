BEGIN;

-- Отгрузка знала перевозчика и трек-номер, но не знала, каким рейсом и в каком контейнере товар
-- идёт морем: docs/backlog-not-yet-integrated.md, раздел 3.I — «доставка: контейнер, тип, судно,
-- порты погрузки и разгрузки, коносамент» — было названо прямо как не построенное.
--
-- Поля необязательны и добавлены к уже существующему неизменяемому снимку (миграция 042), а не в
-- новую сущность: авиа- и автоперевозка, которых в демо-данных большинство, не несут ни контейнера,
-- ни коносамента, и обязательное поле здесь означало бы придумывать значение там, где его не было.
-- Морская отгрузка — единственный случай, где все шесть полей заполнены разом; строка ничего не
-- проверяет между ними, потому что жёсткой связи «если контейнер, то обязательно судно» в реальной
-- практике нет — экспедитор может дать номер контейнера до подтверждения рейса.
ALTER TABLE shipment_notice_snapshots
  ADD COLUMN container_number TEXT NULL CHECK (container_number IS NULL OR length(btrim(container_number)) BETWEEN 1 AND 32),
  ADD COLUMN container_type TEXT NULL CHECK (container_type IS NULL OR length(btrim(container_type)) BETWEEN 1 AND 20),
  ADD COLUMN vessel_name TEXT NULL CHECK (vessel_name IS NULL OR length(btrim(vessel_name)) BETWEEN 1 AND 160),
  ADD COLUMN port_of_loading TEXT NULL CHECK (port_of_loading IS NULL OR length(btrim(port_of_loading)) BETWEEN 1 AND 120),
  ADD COLUMN port_of_discharge TEXT NULL CHECK (port_of_discharge IS NULL OR length(btrim(port_of_discharge)) BETWEEN 1 AND 120),
  ADD COLUMN bill_of_lading_number TEXT NULL CHECK (bill_of_lading_number IS NULL OR length(btrim(bill_of_lading_number)) BETWEEN 1 AND 64);

COMMENT ON COLUMN shipment_notice_snapshots.container_number IS 'Морская перевозка: номер контейнера. NULL для авиа/авто, где его не существует.';
COMMENT ON COLUMN shipment_notice_snapshots.bill_of_lading_number IS 'Номер коносамента (Bill of Lading). NULL, если перевозка не морская или коносамент ещё не выпущен.';

COMMIT;
