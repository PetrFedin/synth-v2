BEGIN;

-- Аналог — ссылка на похожее изделие (docs/backlog-not-yet-integrated.md, раздел C:
-- «аналог — ссылка на похожее изделие.», ни одна строка рядом не вычеркнута — не сделано).
-- Доска референсов (миграция 144) уже несёт свободный текст `referenced_model` («модель прошлого
-- сезона»), но это подпись, а не связь: её нельзя открыть, и ничто не мешает ей разойтись с живым
-- стилем, который она называет. Эта колонка — настоящая ссылка на другую строку `product_styles` в
-- том же бренде, а не выдуманное поле: FK составной, как и у самой доски (`product_style_references
-- _style_fk` ссылается на `(id, brand_id)`), поэтому связать с чужим брендом физически нельзя.
ALTER TABLE product_style_references
  ADD COLUMN linked_style_id text NULL;

ALTER TABLE product_style_references
  ADD CONSTRAINT product_style_references_linked_style_fk
    FOREIGN KEY (linked_style_id, brand_id) REFERENCES product_styles (id, brand_id);

ALTER TABLE product_style_references
  ADD CONSTRAINT product_style_references_linked_style_not_self
    CHECK (linked_style_id IS NULL OR linked_style_id <> style_id);

COMMENT ON COLUMN product_style_references.linked_style_id IS
  'Необязательная ссылка на другой Product Style того же бренда — настоящий «аналог», не вписанный от руки. NULL, когда референс не указывает на каталогизированное изделие (внешнее фото, абстрактный мудборд).';

COMMIT;
