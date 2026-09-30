ALTER TABLE product_media DROP CONSTRAINT product_media_media_role_check;
ALTER TABLE product_media ADD CONSTRAINT product_media_media_role_check
  CHECK (media_role IN ('hero', 'gallery', 'detail', 'swatch', 'technical', 'video', 'document', 'design_sketch', 'tech_pack_thumbnail'));
