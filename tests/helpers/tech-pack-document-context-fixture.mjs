export function documentSourcesFixture(pack, sources) {
  const sku = sources.productSku, brandId = pack.brandId;
  const contentHash = 'b'.repeat(64);
  return {
    product: {
      styleVersion: { id: sku.styleVersionId, brandId, styleId: 'style-1', versionNo: 1,
        titleRu: 'Original RU title', titleEn: 'Original EN title', contentHash },
      colorway: { id: sku.colorwayId, brandId, styleVersionId: sku.styleVersionId,
        code: 'BLACK', nameRu: 'Original RU colour', nameEn: 'Original EN colour', contentHash },
      sizeValue: { id: sku.sizeValueId, brandId, sizeScaleVersionId: sources.sizeValue.sizeScaleVersionId,
        code: 'M', labelRu: 'Original RU size', labelEn: 'Original EN size' },
      sizeScaleVersion: { id: sources.sizeValue.sizeScaleVersionId, brandId,
        sizeScaleId: 'scale-1', versionNo: 1, contentHash },
    },
    supplier: { id: 'supplier-1', supplierCode: pack.supplierCode, brandId, version: 3, status: 'qualified' },
    operations: [2, 1].map(sequence => ({ id: 'operation-' + sequence, techPackCode: pack.techPackCode,
      brandId, sequence, operationCode: 'OP-0' + sequence, nameRu: 'Original RU operation ' + sequence,
      nameEn: 'Original EN operation ' + sequence, equipment: 'Original machine', machineClass: 'manual',
      standardMinutes: sequence === 1 ? 1.25 : 2.35, notes: 'Original operation note',
      createdAt: '2026-10-13T00:00:00.000Z', createdBy: 'actor-1' })),
    sketches: [],
  };
}
