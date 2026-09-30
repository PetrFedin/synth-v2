BEGIN;

-- docs/backlog-not-yet-integrated.md, раздел K: «роли на продукте: состав уже требуемого (дизайнер,
-- продуктовый менеджер, байер, менеджер по тканям, конструктор, технолог)» — конструктор (тот, кто
-- строит лекало) не входил в перечень ролей вовсе, хотя остальные пять из этого списка уже были.
-- Применённые миграции неизменяемы, поэтому ограничение расширяется новой миграцией, а не правкой 080.

ALTER TABLE product_style_responsibilities
  DROP CONSTRAINT product_style_responsibilities_role_check;
ALTER TABLE product_style_responsibilities
  ADD CONSTRAINT product_style_responsibilities_role_check
  CHECK (role IN ('designer', 'product_manager', 'buyer', 'fabric_manager', 'technologist', 'constructor'));

COMMIT;
