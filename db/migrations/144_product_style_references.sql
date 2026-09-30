BEGIN;

-- Доска референсов на продукте (docs/backlog-not-yet-integrated.md, раздел C: «референсы на
-- продукте: модели прошлых сезонов, референс посадки, референс на воротник и застёжку»;
-- docs/omnidata-screens-gap-analysis.md, пункт C.9) — не построено нигде: ни в схеме, ни в домене.
--
-- Привязана к самому стилю (`product_styles`), а не к его версии: референс — вход в разработку,
-- модель прошлого сезона или образец посадки, который остаётся актуальным контекстом независимо от
-- того, какая версия стиля сейчас черновик. Тем же приёмом, что уже несёт `product_media` —
-- пополняемая доска без жизненного цикла, а не документ вроде `product_certifications`: у записи
-- нет «версии содержимого», есть только сам факт «эта картинка добавлена на доску» с порядком
-- показа, а не черновик/выставление/замена.
CREATE TABLE product_style_references (
  id text PRIMARY KEY,
  brand_id text NOT NULL,
  style_id text NOT NULL,
  image_uri text NOT NULL CHECK (length(trim(image_uri)) BETWEEN 1 AND 2048),
  referenced_model text NULL CHECK (referenced_model IS NULL OR length(trim(referenced_model)) BETWEEN 1 AND 160),
  season text NULL CHECK (season IS NULL OR length(trim(season)) BETWEEN 1 AND 40),
  comment text NULL CHECK (comment IS NULL OR length(trim(comment)) BETWEEN 1 AND 1000),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  UNIQUE (style_id, sort_order),
  CONSTRAINT product_style_references_style_fk
    FOREIGN KEY (style_id, brand_id) REFERENCES product_styles (id, brand_id)
);

CREATE INDEX product_style_references_style_order_idx
  ON product_style_references (style_id, sort_order);

COMMENT ON TABLE product_style_references IS
  'Доска референсов на стиле бренда: модели прошлых сезонов, референс посадки/воротника/застёжки и т. п. Пополняемая доска без жизненного цикла — записи не выставляются и не заменяются, только добавляются.';

COMMIT;
