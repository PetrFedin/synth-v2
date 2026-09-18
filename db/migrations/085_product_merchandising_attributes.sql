BEGIN;

-- The descriptive fields a merchandiser fills in on a style: what it is called to a customer, which
-- capsule and delivery wave it belongs to, the article it was based on, whether it is sold as part of
-- a set, and the fabric segment and type. They are added as governed attributes rather than as new
-- columns, so each one arrives with its own validation, its place in the category's field set, its
-- bilingual label and its filter, and no screen has to be taught about it.

INSERT INTO product_attribute_definitions
  (code, name_ru, name_en, description_ru, description_en, data_type, cardinality, allowed_values_dictionary, applies_to, searchable, filterable)
VALUES
('common.marketing_name', 'Маркетинговое название', 'Marketing name', 'Название, под которым изделие показывают покупателю. Отличается от внутреннего наименования модели.', 'The name the product is shown to a customer under. It differs from the internal style title.', 'text', 'zero_or_one', NULL, ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], true, true),
  ('common.capsule', 'Капсула', 'Capsule', 'Капсула сезона, к которой отнесено изделие.', 'The seasonal capsule the product belongs to.', 'text', 'zero_or_one', NULL, ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], true, true),
  ('common.drop', 'Дроп', 'Drop', 'Волна поставки внутри сезона, в которой изделие выходит в продажу.', 'The delivery wave within the season in which the product goes on sale.', 'text', 'zero_or_one', NULL, ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], true, true),
  ('common.analogue', 'Аналог', 'Analogue', 'Артикул ранее выпущенной модели, на которую опирается разработка этой.', 'The article of an earlier style this development is based on.', 'text', 'zero_or_one', NULL, ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], true, true),
  ('common.set_member', 'В составе комплекта', 'Part of a set', 'Продаётся ли изделие как часть комплекта.', 'Whether the product is sold as part of a set.', 'boolean', 'zero_or_one', NULL, ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], true, true),
  ('common.set_type', 'Тип комплекта', 'Set type', 'Вид комплекта, в который входит изделие.', 'The kind of set the product belongs to.', 'text', 'zero_or_one', NULL, ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], true, true),
  ('apparel.fabric_segment', 'Сегмент ткани', 'Fabric segment', 'Ценовой и качественный сегмент основной ткани.', 'The price and quality segment of the main fabric.', 'text', 'zero_or_one', NULL, ARRAY['apparel']::text[], true, true),
  ('apparel.fabric_type', 'Тип ткани', 'Fabric type', 'Тип основной ткани изделия.', 'The type of the main fabric of the product.', 'text', 'zero_or_one', NULL, ARRAY['apparel']::text[], true, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO product_attribute_set_members (set_code, attribute_code, sort_order)
VALUES
('product.apparel.core', 'common.marketing_name', 32),
  ('product.apparel.core', 'common.capsule', 33),
  ('product.apparel.core', 'common.drop', 34),
  ('product.apparel.core', 'common.analogue', 35),
  ('product.apparel.core', 'common.set_member', 36),
  ('product.apparel.core', 'common.set_type', 37),
  ('product.apparel.core', 'apparel.fabric_segment', 38),
  ('product.apparel.core', 'apparel.fabric_type', 39),
  ('product.footwear.core', 'common.marketing_name', 27),
  ('product.footwear.core', 'common.capsule', 28),
  ('product.footwear.core', 'common.drop', 29),
  ('product.footwear.core', 'common.analogue', 30),
  ('product.footwear.core', 'common.set_member', 31),
  ('product.footwear.core', 'common.set_type', 32),
  ('product.bags_accessories.core', 'common.marketing_name', 20),
  ('product.bags_accessories.core', 'common.capsule', 21),
  ('product.bags_accessories.core', 'common.drop', 22),
  ('product.bags_accessories.core', 'common.analogue', 23),
  ('product.bags_accessories.core', 'common.set_member', 24),
  ('product.bags_accessories.core', 'common.set_type', 25),
  ('product.beauty.core', 'common.marketing_name', 17),
  ('product.beauty.core', 'common.capsule', 18),
  ('product.beauty.core', 'common.drop', 19),
  ('product.beauty.core', 'common.analogue', 20),
  ('product.beauty.core', 'common.set_member', 21),
  ('product.beauty.core', 'common.set_type', 22),
  ('product.home.core', 'common.marketing_name', 20),
  ('product.home.core', 'common.capsule', 21),
  ('product.home.core', 'common.drop', 22),
  ('product.home.core', 'common.analogue', 23),
  ('product.home.core', 'common.set_member', 24),
  ('product.home.core', 'common.set_type', 25)
ON CONFLICT (set_code, attribute_code) DO NOTHING;

COMMIT;
