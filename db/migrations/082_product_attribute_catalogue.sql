BEGIN;

-- The attribute catalogue, loaded into the database so the platform can hold itself to it.
--
-- Until now a product attribute was any lowercase string: nothing stopped a heel height being written
-- on a jacket, or a typo creating a new attribute that no screen would ever show. The governed
-- catalogue in mdm/attributes/attribute-catalog.json already says which attributes exist, what they
-- mean and which product families they belong to, and a category entry already declares its family in
-- mdm_entries.attributes ->> 'product_family'. Both facts were sitting unused. This loads the
-- catalogue and starts enforcing the link, so the set of fields a product carries follows from its
-- category instead of from whoever wrote the request.
--
-- The rows below are generated from that JSON file; a contract test re-reads the file and fails if the
-- two ever drift apart.

CREATE TABLE IF NOT EXISTS product_attribute_definitions (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  name_ru text NOT NULL,
  name_en text NOT NULL,
  description_ru text NOT NULL,
  description_en text NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('boolean', 'decimal', 'duration', 'json', 'quantity', 'reference', 'reference_list', 'text')),
  cardinality text NOT NULL CHECK (cardinality IN ('zero_or_one', 'one_or_more', 'zero_or_more')),
  allowed_values_dictionary text NULL,
  applies_to text[] NOT NULL CHECK (array_length(applies_to, 1) >= 1),
  searchable boolean NOT NULL,
  filterable boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS product_attribute_set_members (
  set_code text NOT NULL CHECK (set_code ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  attribute_code text NOT NULL REFERENCES product_attribute_definitions(code),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  PRIMARY KEY (set_code, attribute_code)
);

INSERT INTO product_attribute_definitions
  (code, name_ru, name_en, description_ru, description_en, data_type, cardinality, allowed_values_dictionary, applies_to, searchable, filterable)
VALUES
  ('common.dimensions', 'Габариты изделия', 'Product dimensions', 'Длина, ширина и высота изделия в нормализованных единицах.', 'Product length, width and height in normalized units.', 'json', 'zero_or_one', NULL, ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], false, true),
  ('common.net_weight', 'Масса нетто', 'Net weight', 'Масса товара без транспортной упаковки.', 'Product weight excluding transport packaging.', 'quantity', 'zero_or_one', NULL, ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], false, true),
  ('common.primary_material', 'Основной материал', 'Primary material', 'Материал, определяющий основную конструкцию или потребительское свойство изделия.', 'Material defining the main construction or consumer property of the product.', 'reference', 'zero_or_one', 'material.material', ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], true, true),
  ('common.secondary_materials', 'Дополнительные материалы', 'Secondary materials', 'Перечень дополнительных материалов изделия.', 'List of secondary product materials.', 'reference_list', 'zero_or_more', 'material.material', ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], true, true),
  ('common.care_method', 'Способ ухода', 'Care method', 'Разрешённые и запрещённые действия по уходу за изделием.', 'Permitted and prohibited product care actions.', 'reference_list', 'one_or_more', 'material.care_method', ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], false, false),
  ('common.operating_season', 'Сезон эксплуатации', 'Operating season', 'Условия сезона, для которых предназначено изделие.', 'Seasonal conditions for which the product is intended.', 'reference_list', 'one_or_more', 'assortment.seasonality', ARRAY['apparel','footwear','bags_accessories','home']::text[], false, true),
  ('common.transparency', 'Прозрачность', 'Transparency', 'Степень прозрачности изделия или материала.', 'Degree of product or material transparency.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['apparel','home']::text[], false, true),
  ('common.elasticity', 'Эластичность', 'Elasticity', 'Способность изделия или материала растягиваться и восстанавливаться.', 'Ability of a product or material to stretch and recover.', 'decimal', 'zero_or_one', NULL, ARRAY['apparel','footwear','home']::text[], false, true),
  ('common.packaging_rule', 'Правило упаковки', 'Packaging rule', 'Требуемая конфигурация индивидуальной и транспортной упаковки.', 'Required individual and transport packaging configuration.', 'reference', 'zero_or_one', 'packaging.pack_ratio', ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], false, false),
  ('common.country_of_origin', 'Страна происхождения', 'Country of origin', 'Юридически определённая страна происхождения товара.', 'Legally determined country of origin of the product.', 'reference', 'zero_or_one', 'system.country', ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], true, true),
  ('common.age_group', 'Возрастная группа', 'Age group', 'Возрастная группа, на которую рассчитаны конструкция и размерная шкала.', 'The age group the construction and size scale are built for.', 'reference', 'zero_or_one', 'assortment.age_group', ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], true, true),
  ('common.novelty', 'Новизна', 'Novelty', 'Отношение модели к сезону: новинка, переходящая или базовая позиция.', 'How the style relates to the season: new, carried over or a core line.', 'reference', 'zero_or_one', 'assortment.novelty', ARRAY['apparel','footwear','bags_accessories','beauty','home']::text[], true, true),
  ('apparel.silhouette', 'Силуэт', 'Silhouette', 'Общая объёмно-пространственная форма изделия.', 'Overall volumetric shape of the garment.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['apparel']::text[], true, true),
  ('apparel.fit', 'Посадка', 'Fit', 'Характер прилегания изделия к телу.', 'How closely the garment fits the body.', 'reference', 'zero_or_one', 'fit.class', ARRAY['apparel']::text[], true, true),
  ('apparel.garment_length', 'Длина изделия', 'Garment length', 'Классификационная или измеряемая длина изделия.', 'Classified or measured garment length.', 'quantity', 'zero_or_one', NULL, ARRAY['apparel']::text[], false, true),
  ('apparel.sleeve_length', 'Длина рукава', 'Sleeve length', 'Длина или категорийное обозначение рукава.', 'Sleeve length or categorical sleeve-length designation.', 'quantity', 'zero_or_one', NULL, ARRAY['apparel']::text[], false, true),
  ('apparel.sleeve_type', 'Тип рукава', 'Sleeve type', 'Конструктивный тип рукава.', 'Construction type of the sleeve.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['apparel']::text[], false, true),
  ('apparel.shoulder_type', 'Тип плеча', 'Shoulder type', 'Конструктивное решение плечевого пояса.', 'Construction of the shoulder area.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['apparel']::text[], false, true),
  ('apparel.neckline', 'Горловина', 'Neckline', 'Форма и глубина горловины.', 'Shape and depth of the neckline.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['apparel']::text[], false, true),
  ('apparel.collar', 'Воротник', 'Collar', 'Тип и конструкция воротника.', 'Collar type and construction.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['apparel']::text[], false, true),
  ('apparel.lapel', 'Лацкан', 'Lapel', 'Тип, ширина и форма лацкана.', 'Lapel type, width and shape.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['apparel']::text[], false, true),
  ('apparel.closure', 'Застёжка', 'Closure', 'Основной тип застёжки изделия.', 'Primary garment closure type.', 'reference_list', 'one_or_more', 'trim.type', ARRAY['apparel']::text[], false, true),
  ('apparel.waist_construction', 'Конструкция талии', 'Waist construction', 'Конструктивное решение области талии.', 'Construction of the waist area.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['apparel']::text[], false, true),
  ('apparel.rise', 'Высота посадки', 'Rise', 'Высота посадки брюк, юбки или шорт.', 'Rise height of trousers, skirts or shorts.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['apparel']::text[], false, true),
  ('apparel.pocket', 'Карманы', 'Pockets', 'Типы, количество и расположение карманов.', 'Pocket types, count and placement.', 'json', 'zero_or_one', NULL, ARRAY['apparel']::text[], false, true),
  ('apparel.vent', 'Шлица', 'Vent', 'Тип, количество и расположение шлиц.', 'Vent type, count and placement.', 'json', 'zero_or_one', NULL, ARRAY['apparel']::text[], false, true),
  ('apparel.cuff', 'Манжета', 'Cuff', 'Тип и параметры манжеты.', 'Cuff type and parameters.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['apparel']::text[], false, true),
  ('apparel.belt', 'Пояс', 'Belt', 'Наличие, тип и конструкция пояса.', 'Presence, type and construction of the belt.', 'json', 'zero_or_one', NULL, ARRAY['apparel']::text[], false, true),
  ('apparel.hood', 'Капюшон', 'Hood', 'Наличие и конструкция капюшона.', 'Presence and construction of the hood.', 'json', 'zero_or_one', NULL, ARRAY['apparel']::text[], false, true),
  ('apparel.lining', 'Подкладка', 'Lining', 'Тип, покрытие и материал подкладки.', 'Lining type, coverage and material.', 'json', 'zero_or_one', NULL, ARRAY['apparel']::text[], false, true),
  ('apparel.insulation', 'Утепление', 'Insulation', 'Тип, масса и распределение утеплителя.', 'Insulation type, weight and distribution.', 'json', 'zero_or_one', NULL, ARRAY['apparel']::text[], false, true),
  ('apparel.construction_features', 'Конструктивные особенности', 'Construction features', 'Список значимых конструктивных особенностей изделия.', 'List of significant garment construction features.', 'reference_list', 'zero_or_more', 'design.construction_node', ARRAY['apparel']::text[], false, true),
  ('footwear.type', 'Тип обуви', 'Footwear type', 'Коммерческий и конструктивный тип обуви.', 'Commercial and construction footwear type.', 'reference', 'zero_or_one', 'assortment.product_type', ARRAY['footwear']::text[], true, true),
  ('footwear.last', 'Колодка', 'Last', 'Колодка, определяющая форму и посадку обуви.', 'Last defining footwear shape and fit.', 'reference', 'zero_or_one', 'fit.block', ARRAY['footwear']::text[], true, true),
  ('footwear.width', 'Полнота', 'Width fitting', 'Полнота обуви по выбранной размерной системе.', 'Footwear width according to the selected size system.', 'reference', 'zero_or_one', 'fit.fullness', ARRAY['footwear']::text[], false, true),
  ('footwear.heel_height', 'Высота каблука', 'Heel height', 'Вертикальная высота каблука.', 'Vertical heel height.', 'quantity', 'zero_or_one', NULL, ARRAY['footwear']::text[], false, true),
  ('footwear.heel_type', 'Тип каблука', 'Heel type', 'Геометрический и конструктивный тип каблука.', 'Geometric and construction heel type.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['footwear']::text[], false, true),
  ('footwear.platform_height', 'Высота платформы', 'Platform height', 'Высота платформы в передней части обуви.', 'Platform height at the forepart of the footwear.', 'quantity', 'zero_or_one', NULL, ARRAY['footwear']::text[], false, true),
  ('footwear.shaft_height', 'Высота голенища', 'Shaft height', 'Высота голенища от опорной поверхности.', 'Shaft height measured from the support surface.', 'quantity', 'zero_or_one', NULL, ARRAY['footwear']::text[], false, true),
  ('footwear.shaft_circumference', 'Обхват голенища', 'Shaft circumference', 'Внутренний обхват голенища в контрольной точке.', 'Internal shaft circumference at the specified control point.', 'quantity', 'zero_or_one', NULL, ARRAY['footwear']::text[], false, true),
  ('footwear.toe_shape', 'Форма мыса', 'Toe shape', 'Коммерческая форма носочной части.', 'Commercial shape of the toe area.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['footwear']::text[], false, true),
  ('footwear.closure', 'Застёжка обуви', 'Footwear closure', 'Способ фиксации обуви на стопе.', 'Method used to secure footwear on the foot.', 'reference_list', 'one_or_more', 'trim.type', ARRAY['footwear']::text[], false, true),
  ('footwear.upper_material', 'Материал верха', 'Upper material', 'Материал или композиция материалов верха обуви.', 'Material or material composition of the footwear upper.', 'reference_list', 'one_or_more', 'material.material', ARRAY['footwear']::text[], false, true),
  ('footwear.lining_material', 'Материал подкладки', 'Lining material', 'Материал внутренней подкладки обуви.', 'Material of the footwear lining.', 'reference_list', 'one_or_more', 'material.material', ARRAY['footwear']::text[], false, true),
  ('footwear.insole_material', 'Материал стельки', 'Insole material', 'Материал и конструкция вкладной или основной стельки.', 'Material and construction of the insole.', 'reference_list', 'one_or_more', 'material.material', ARRAY['footwear']::text[], false, true),
  ('footwear.outsole_material', 'Материал подошвы', 'Outsole material', 'Материал ходовой поверхности подошвы.', 'Material of the outsole contact surface.', 'reference_list', 'one_or_more', 'material.material', ARRAY['footwear']::text[], false, true),
  ('footwear.sole_attachment_method', 'Метод крепления подошвы', 'Sole attachment method', 'Технологический способ соединения подошвы и верха.', 'Production method used to attach the sole to the upper.', 'reference', 'zero_or_one', 'production.operation', ARRAY['footwear']::text[], false, true),
  ('footwear.water_resistance', 'Водостойкость', 'Water resistance', 'Заявленный и испытанный уровень водостойкости.', 'Claimed and tested water-resistance level.', 'quantity', 'zero_or_one', NULL, ARRAY['footwear']::text[], false, true),
  ('footwear.pair_weight', 'Вес пары', 'Pair weight', 'Масса пары обуви в базовом размере.', 'Weight of a footwear pair in the base size.', 'quantity', 'zero_or_one', NULL, ARRAY['footwear']::text[], false, true),
  ('bag.type', 'Тип сумки', 'Bag type', 'Коммерческий и конструктивный тип сумки.', 'Commercial and construction bag type.', 'reference', 'zero_or_one', 'assortment.product_type', ARRAY['bags_accessories']::text[], true, true),
  ('bag.construction', 'Конструкция сумки', 'Bag construction', 'Жёсткость, каркасность и конструктивная схема сумки.', 'Rigidity, frame and construction scheme of the bag.', 'reference', 'zero_or_one', 'attribute.value_synonym', ARRAY['bags_accessories']::text[], false, true),
  ('bag.capacity', 'Вместимость', 'Capacity', 'Полезный внутренний объём изделия.', 'Usable internal volume of the product.', 'quantity', 'zero_or_one', NULL, ARRAY['bags_accessories']::text[], false, true),
  ('bag.handle_drop', 'Высота ручек', 'Handle drop', 'Вертикальное расстояние от центра ручки до верхнего края сумки.', 'Vertical distance from the handle center to the top edge of the bag.', 'quantity', 'zero_or_one', NULL, ARRAY['bags_accessories']::text[], false, true),
  ('bag.strap', 'Ремень', 'Strap', 'Наличие, съёмность, регулируемость и длина ремня.', 'Presence, removability, adjustability and length of the strap.', 'json', 'zero_or_one', NULL, ARRAY['bags_accessories']::text[], false, true),
  ('bag.closure', 'Тип закрывания', 'Closure type', 'Основной и дополнительные способы закрывания сумки.', 'Primary and secondary bag closure methods.', 'reference_list', 'one_or_more', 'trim.type', ARRAY['bags_accessories']::text[], false, true),
  ('bag.internal_compartments', 'Внутренние отделения', 'Internal compartments', 'Количество, тип и назначение внутренних отделений.', 'Count, type and purpose of internal compartments.', 'json', 'zero_or_one', NULL, ARRAY['bags_accessories']::text[], false, true),
  ('bag.pockets', 'Карманы', 'Pockets', 'Количество, тип и расположение карманов.', 'Count, type and placement of pockets.', 'json', 'zero_or_one', NULL, ARRAY['bags_accessories']::text[], false, true),
  ('bag.hardware_type', 'Тип металлической фурнитуры', 'Hardware type', 'Типы и отделка видимой металлической фурнитуры.', 'Types and finishes of visible metal hardware.', 'reference_list', 'zero_or_more', 'trim.hardware_finish', ARRAY['bags_accessories']::text[], false, true),
  ('bag.device_compatibility', 'Совместимость с устройствами', 'Device compatibility', 'Максимальные габариты совместимых телефонов, планшетов или ноутбуков.', 'Maximum dimensions of compatible phones, tablets or laptops.', 'json', 'zero_or_one', NULL, ARRAY['bags_accessories']::text[], false, true),
  ('bag.carry_method', 'Способ ношения', 'Carry method', 'Допустимые способы ношения изделия.', 'Supported ways to carry the product.', 'reference_list', 'one_or_more', 'attribute.value_synonym', ARRAY['bags_accessories']::text[], false, true),
  ('beauty.net_volume', 'Объём нетто', 'Net volume', 'Количество продукта по объёму без упаковки.', 'Volume of product excluding packaging.', 'quantity', 'zero_or_one', NULL, ARRAY['beauty']::text[], false, true),
  ('beauty.formula', 'Рецептура', 'Formula', 'Версионируемая рецептура продукта с долями компонентов.', 'Versioned product formulation with component proportions.', 'json', 'zero_or_one', NULL, ARRAY['beauty']::text[], false, false),
  ('beauty.ingredients', 'Ингредиенты', 'Ingredients', 'Маркировочный список ингредиентов в установленном порядке.', 'Label ingredient list in the required order.', 'reference_list', 'one_or_more', 'material.material', ARRAY['beauty']::text[], true, true),
  ('beauty.fragrance', 'Аромат', 'Fragrance', 'Ароматическая характеристика и семейство продукта.', 'Fragrance profile and family of the product.', 'reference_list', 'zero_or_more', 'attribute.value_synonym', ARRAY['beauty']::text[], false, true),
  ('beauty.shelf_life', 'Срок годности', 'Shelf life', 'Срок годности в закрытой упаковке при установленных условиях хранения.', 'Shelf life in unopened packaging under specified storage conditions.', 'duration', 'zero_or_one', NULL, ARRAY['beauty']::text[], false, true),
  ('beauty.period_after_opening', 'Срок после вскрытия', 'Period after opening', 'Допустимый срок использования после первого вскрытия.', 'Permitted use period after first opening.', 'duration', 'zero_or_one', NULL, ARRAY['beauty']::text[], false, true),
  ('beauty.skin_type', 'Тип кожи', 'Skin type', 'Типы кожи, для которых предназначен продукт.', 'Skin types for which the product is intended.', 'reference_list', 'one_or_more', 'attribute.value_synonym', ARRAY['beauty']::text[], false, true),
  ('beauty.purpose', 'Назначение', 'Purpose', 'Функциональное назначение и заявленный эффект продукта.', 'Functional purpose and claimed effect of the product.', 'reference_list', 'one_or_more', 'assortment.purpose', ARRAY['beauty']::text[], false, true),
  ('beauty.directions', 'Способ применения', 'Directions for use', 'Инструкция, дозировка и ограничения по применению.', 'Instructions, dosage and restrictions for use.', 'text', 'zero_or_one', NULL, ARRAY['beauty']::text[], false, false),
  ('beauty.packaging_type', 'Тип первичной упаковки', 'Primary packaging type', 'Тип упаковки, непосредственно контактирующей с продуктом.', 'Type of packaging in direct contact with the product.', 'reference', 'zero_or_one', 'packaging.individual', ARRAY['beauty']::text[], false, true),
  ('home.room', 'Помещение', 'Room', 'Тип помещения или зоны применения товара.', 'Room or application area for the product.', 'reference_list', 'one_or_more', 'attribute.value_synonym', ARRAY['home']::text[], false, true),
  ('home.capacity', 'Вместимость', 'Capacity', 'Полезный объём или допустимое количество содержимого.', 'Usable volume or permitted content quantity.', 'quantity', 'zero_or_one', NULL, ARRAY['home']::text[], false, true),
  ('home.assembly_required', 'Требуется сборка', 'Assembly required', 'Признак необходимости сборки после поставки.', 'Indicates whether assembly is required after delivery.', 'boolean', 'zero_or_one', NULL, ARRAY['home']::text[], false, true),
  ('home.assembly_instructions', 'Инструкция по сборке', 'Assembly instructions', 'Ссылка на утверждённую версию инструкции по сборке.', 'Reference to the approved assembly instruction version.', 'reference', 'zero_or_one', 'system.document_type', ARRAY['home']::text[], false, false),
  ('home.fragility', 'Хрупкость', 'Fragility', 'Класс хрупкости и требования к обращению.', 'Fragility class and handling requirements.', 'reference', 'zero_or_one', 'logistics.cargo_class', ARRAY['home']::text[], false, true),
  ('home.maximum_load', 'Максимальная нагрузка', 'Maximum load', 'Максимальная безопасная эксплуатационная нагрузка.', 'Maximum safe operating load.', 'quantity', 'zero_or_one', NULL, ARRAY['home']::text[], false, true),
  ('home.flame_resistance', 'Огнестойкость', 'Flame resistance', 'Класс, стандарт и результат испытания на огнестойкость.', 'Class, standard and result of flame-resistance testing.', 'json', 'zero_or_one', NULL, ARRAY['home']::text[], false, true),
  ('home.outdoor_suitability', 'Пригодность для улицы', 'Outdoor suitability', 'Допустимость и ограничения наружной эксплуатации.', 'Suitability and restrictions for outdoor use.', 'boolean', 'zero_or_one', NULL, ARRAY['home']::text[], false, true),
  ('material.gsm', 'Поверхностная плотность', 'Grams per square metre', 'Масса материала на единицу площади.', 'Material mass per unit area.', 'quantity', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.width', 'Номинальная ширина', 'Nominal width', 'Полная номинальная ширина рулонного материала.', 'Full nominal width of roll material.', 'quantity', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.usable_width', 'Полезная ширина', 'Usable width', 'Ширина материала, пригодная для раскроя после исключения кромок и дефектов.', 'Width usable for cutting after excluding selvedges and defects.', 'quantity', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.thickness', 'Толщина', 'Thickness', 'Толщина материала при установленном методе измерения.', 'Material thickness under a specified measurement method.', 'quantity', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.shrinkage_length', 'Усадка по длине', 'Lengthwise shrinkage', 'Изменение размера по длине после заданной обработки.', 'Lengthwise dimensional change after specified treatment.', 'decimal', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.shrinkage_width', 'Усадка по ширине', 'Widthwise shrinkage', 'Изменение размера по ширине после заданной обработки.', 'Widthwise dimensional change after specified treatment.', 'decimal', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.stretch_length', 'Растяжимость по длине', 'Lengthwise stretch', 'Процент растяжения материала по длине при заданной нагрузке.', 'Percentage lengthwise stretch under a specified load.', 'decimal', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.stretch_width', 'Растяжимость по ширине', 'Widthwise stretch', 'Процент растяжения материала по ширине при заданной нагрузке.', 'Percentage widthwise stretch under a specified load.', 'decimal', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.breathability', 'Воздухопроницаемость', 'Breathability', 'Результат испытания воздухопроницаемости с методом и условиями.', 'Breathability test result with method and conditions.', 'quantity', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.water_resistance', 'Водостойкость материала', 'Material water resistance', 'Результат испытания сопротивления проникновению воды.', 'Result of a water-penetration resistance test.', 'quantity', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.weave_or_knit', 'Переплетение или вязка', 'Weave or knit structure', 'Структура формирования тканого или трикотажного полотна.', 'Structural formation of woven or knitted material.', 'reference', 'zero_or_one', 'material.weave', ARRAY['material']::text[], false, true),
  ('material.gauge', 'Класс вязальной машины', 'Gauge', 'Количество игл или петель на установленную единицу длины.', 'Needles or stitches per specified unit of length.', 'decimal', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.nap_direction', 'Направление ворса', 'Nap direction', 'Направленность ворса и ограничение раскладки one-way.', 'Nap direction and one-way marker restriction.', 'reference', 'zero_or_one', 'material.nap_direction', ARRAY['material']::text[], false, true),
  ('material.usable_yield', 'Полезный выход материала', 'Usable material yield', 'Доля материала, пригодная для производства после дефектов и технических потерь.', 'Share of material usable for production after defects and technical losses.', 'decimal', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.storage_condition', 'Условия хранения', 'Storage condition', 'Требования к температуре, влажности, свету и размещению.', 'Temperature, humidity, light and placement storage requirements.', 'json', 'zero_or_one', NULL, ARRAY['material']::text[], false, true),
  ('material.shelf_life', 'Срок хранения', 'Shelf life', 'Срок хранения до обязательной повторной проверки или списания.', 'Storage period before mandatory retesting or disposal.', 'duration', 'zero_or_one', NULL, ARRAY['material']::text[], false, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO product_attribute_set_members (set_code, attribute_code, sort_order)
VALUES
  ('product.apparel.core', 'common.dimensions', 0),
  ('product.apparel.core', 'common.net_weight', 1),
  ('product.apparel.core', 'common.primary_material', 2),
  ('product.apparel.core', 'common.secondary_materials', 3),
  ('product.apparel.core', 'common.care_method', 4),
  ('product.apparel.core', 'common.operating_season', 5),
  ('product.apparel.core', 'common.transparency', 6),
  ('product.apparel.core', 'common.elasticity', 7),
  ('product.apparel.core', 'common.packaging_rule', 8),
  ('product.apparel.core', 'common.country_of_origin', 9),
  ('product.apparel.core', 'common.novelty', 10),
  ('product.apparel.core', 'common.age_group', 11),
  ('product.apparel.core', 'apparel.silhouette', 12),
  ('product.apparel.core', 'apparel.fit', 13),
  ('product.apparel.core', 'apparel.garment_length', 14),
  ('product.apparel.core', 'apparel.sleeve_length', 15),
  ('product.apparel.core', 'apparel.sleeve_type', 16),
  ('product.apparel.core', 'apparel.shoulder_type', 17),
  ('product.apparel.core', 'apparel.neckline', 18),
  ('product.apparel.core', 'apparel.collar', 19),
  ('product.apparel.core', 'apparel.lapel', 20),
  ('product.apparel.core', 'apparel.closure', 21),
  ('product.apparel.core', 'apparel.waist_construction', 22),
  ('product.apparel.core', 'apparel.rise', 23),
  ('product.apparel.core', 'apparel.pocket', 24),
  ('product.apparel.core', 'apparel.vent', 25),
  ('product.apparel.core', 'apparel.cuff', 26),
  ('product.apparel.core', 'apparel.belt', 27),
  ('product.apparel.core', 'apparel.hood', 28),
  ('product.apparel.core', 'apparel.lining', 29),
  ('product.apparel.core', 'apparel.insulation', 30),
  ('product.apparel.core', 'apparel.construction_features', 31),
  ('product.footwear.core', 'common.dimensions', 0),
  ('product.footwear.core', 'common.net_weight', 1),
  ('product.footwear.core', 'common.primary_material', 2),
  ('product.footwear.core', 'common.secondary_materials', 3),
  ('product.footwear.core', 'common.care_method', 4),
  ('product.footwear.core', 'common.operating_season', 5),
  ('product.footwear.core', 'common.packaging_rule', 6),
  ('product.footwear.core', 'common.country_of_origin', 7),
  ('product.footwear.core', 'common.novelty', 8),
  ('product.footwear.core', 'common.age_group', 9),
  ('product.footwear.core', 'footwear.type', 10),
  ('product.footwear.core', 'footwear.last', 11),
  ('product.footwear.core', 'footwear.width', 12),
  ('product.footwear.core', 'footwear.heel_height', 13),
  ('product.footwear.core', 'footwear.heel_type', 14),
  ('product.footwear.core', 'footwear.platform_height', 15),
  ('product.footwear.core', 'footwear.shaft_height', 16),
  ('product.footwear.core', 'footwear.shaft_circumference', 17),
  ('product.footwear.core', 'footwear.toe_shape', 18),
  ('product.footwear.core', 'footwear.closure', 19),
  ('product.footwear.core', 'footwear.upper_material', 20),
  ('product.footwear.core', 'footwear.lining_material', 21),
  ('product.footwear.core', 'footwear.insole_material', 22),
  ('product.footwear.core', 'footwear.outsole_material', 23),
  ('product.footwear.core', 'footwear.sole_attachment_method', 24),
  ('product.footwear.core', 'footwear.water_resistance', 25),
  ('product.footwear.core', 'footwear.pair_weight', 26),
  ('product.bags_accessories.core', 'common.dimensions', 0),
  ('product.bags_accessories.core', 'common.net_weight', 1),
  ('product.bags_accessories.core', 'common.primary_material', 2),
  ('product.bags_accessories.core', 'common.secondary_materials', 3),
  ('product.bags_accessories.core', 'common.care_method', 4),
  ('product.bags_accessories.core', 'common.packaging_rule', 5),
  ('product.bags_accessories.core', 'common.country_of_origin', 6),
  ('product.bags_accessories.core', 'common.novelty', 7),
  ('product.bags_accessories.core', 'common.age_group', 8),
  ('product.bags_accessories.core', 'bag.type', 9),
  ('product.bags_accessories.core', 'bag.construction', 10),
  ('product.bags_accessories.core', 'bag.capacity', 11),
  ('product.bags_accessories.core', 'bag.handle_drop', 12),
  ('product.bags_accessories.core', 'bag.strap', 13),
  ('product.bags_accessories.core', 'bag.closure', 14),
  ('product.bags_accessories.core', 'bag.internal_compartments', 15),
  ('product.bags_accessories.core', 'bag.pockets', 16),
  ('product.bags_accessories.core', 'bag.hardware_type', 17),
  ('product.bags_accessories.core', 'bag.device_compatibility', 18),
  ('product.bags_accessories.core', 'bag.carry_method', 19),
  ('product.beauty.core', 'common.dimensions', 0),
  ('product.beauty.core', 'common.net_weight', 1),
  ('product.beauty.core', 'common.primary_material', 2),
  ('product.beauty.core', 'common.packaging_rule', 3),
  ('product.beauty.core', 'common.country_of_origin', 4),
  ('product.beauty.core', 'common.novelty', 5),
  ('product.beauty.core', 'common.age_group', 6),
  ('product.beauty.core', 'beauty.net_volume', 7),
  ('product.beauty.core', 'beauty.formula', 8),
  ('product.beauty.core', 'beauty.ingredients', 9),
  ('product.beauty.core', 'beauty.fragrance', 10),
  ('product.beauty.core', 'beauty.shelf_life', 11),
  ('product.beauty.core', 'beauty.period_after_opening', 12),
  ('product.beauty.core', 'beauty.skin_type', 13),
  ('product.beauty.core', 'beauty.purpose', 14),
  ('product.beauty.core', 'beauty.directions', 15),
  ('product.beauty.core', 'beauty.packaging_type', 16),
  ('product.home.core', 'common.dimensions', 0),
  ('product.home.core', 'common.net_weight', 1),
  ('product.home.core', 'common.primary_material', 2),
  ('product.home.core', 'common.secondary_materials', 3),
  ('product.home.core', 'common.care_method', 4),
  ('product.home.core', 'common.operating_season', 5),
  ('product.home.core', 'common.transparency', 6),
  ('product.home.core', 'common.elasticity', 7),
  ('product.home.core', 'common.packaging_rule', 8),
  ('product.home.core', 'common.country_of_origin', 9),
  ('product.home.core', 'common.novelty', 10),
  ('product.home.core', 'common.age_group', 11),
  ('product.home.core', 'home.room', 12),
  ('product.home.core', 'home.capacity', 13),
  ('product.home.core', 'home.assembly_required', 14),
  ('product.home.core', 'home.assembly_instructions', 15),
  ('product.home.core', 'home.fragility', 16),
  ('product.home.core', 'home.maximum_load', 17),
  ('product.home.core', 'home.flame_resistance', 18),
  ('product.home.core', 'home.outdoor_suitability', 19),
  ('material.technical.core', 'material.gsm', 0),
  ('material.technical.core', 'material.width', 1),
  ('material.technical.core', 'material.usable_width', 2),
  ('material.technical.core', 'material.thickness', 3),
  ('material.technical.core', 'material.shrinkage_length', 4),
  ('material.technical.core', 'material.shrinkage_width', 5),
  ('material.technical.core', 'material.stretch_length', 6),
  ('material.technical.core', 'material.stretch_width', 7),
  ('material.technical.core', 'material.breathability', 8),
  ('material.technical.core', 'material.water_resistance', 9),
  ('material.technical.core', 'material.weave_or_knit', 10),
  ('material.technical.core', 'material.gauge', 11),
  ('material.technical.core', 'material.nap_direction', 12),
  ('material.technical.core', 'material.usable_yield', 13),
  ('material.technical.core', 'material.storage_condition', 14),
  ('material.technical.core', 'material.shelf_life', 15)
ON CONFLICT (set_code, attribute_code) DO NOTHING;

-- A product carries the fields its category calls for. The category entry declares the product family
-- it belongs to, every attribute declares the families it applies to, and an attribute written onto a
-- product whose family it does not cover is refused here rather than quietly stored and never shown.
-- A style version with no category yet is left alone: the category is chosen during development, and
-- refusing attributes before it exists would block the very work that leads to it.
CREATE OR REPLACE FUNCTION assert_product_attribute_fits_category() RETURNS trigger AS $$
DECLARE
  definition product_attribute_definitions%ROWTYPE;
  style_version_id text;
  family text;
BEGIN
  SELECT * INTO definition FROM product_attribute_definitions WHERE code = NEW.attribute_code;
  IF definition.code IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_ATTRIBUTE_NOT_IN_CATALOGUE: % is not a governed product attribute', NEW.attribute_code
      USING ERRCODE = 'check_violation';
  END IF;

  style_version_id := CASE NEW.owner_type
    WHEN 'style_version' THEN NEW.owner_id
    WHEN 'colorway' THEN (SELECT colorway.style_version_id FROM product_colorways colorway WHERE colorway.id = NEW.owner_id)
    WHEN 'sku' THEN (SELECT sku.style_version_id FROM product_skus sku WHERE sku.id = NEW.owner_id)
  END;

  SELECT entry.attributes ->> 'product_family' INTO family
    FROM product_style_versions version
    JOIN mdm_entries entry ON entry.id = version.category_entry_id
   WHERE version.id = style_version_id;

  IF family IS NOT NULL AND NOT (family = ANY (definition.applies_to)) THEN
    RAISE EXCEPTION 'PRODUCT_ATTRIBUTE_CATEGORY_MISMATCH: % does not apply to the % family', NEW.attribute_code, family
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_attribute_values_fit_category ON product_attribute_values;
CREATE TRIGGER product_attribute_values_fit_category
  BEFORE INSERT OR UPDATE ON product_attribute_values
  FOR EACH ROW EXECUTE FUNCTION assert_product_attribute_fits_category();

COMMIT;
