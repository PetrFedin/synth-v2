import { withApprovedDemandProductionOpenApi } from './approved-demand-production-openapi.mjs';
import { withBomOpenApi } from './bom-openapi.mjs';
import { withCollectionStyleVersionOpenApi } from './collection-style-version-openapi.mjs';
import { withCommercialPublicationOpenApi } from './commercial-publication-openapi.mjs';
import { withCostAllocationOpenApi } from './cost-allocation-openapi.mjs';
import { withCostCloseReadinessOpenApi } from './cost-close-readiness-openapi.mjs';
import { withEcon003AllocationMarginOpenApi } from './econ003-allocation-margin-openapi.mjs';
import { withFinalQualityOpenApi } from './final-quality-openapi.mjs';
import { withFulfillmentOpenApi } from './fulfillment-openapi.mjs';
import { withInventoryOpenApi } from './inventory-openapi.mjs';
import { withProductIdentityOpenApi } from './product-identity-openapi.mjs';
import { withProductReadinessOpenApi } from './product-readiness-openapi.mjs';
import { withReceiptClaimsOpenApi } from './receipt-claims-openapi.mjs';
import { withRetailDoorOpenApi } from './retail-door-openapi.mjs';
import { withSelectionMatrixOpenApi } from './selection-matrix-openapi.mjs';
import { withSupplierRecoveryOpenApi } from './supplier-recovery-openapi.mjs';
import { withSupplierEconomicPerformanceOpenApi } from './supplier-economic-performance-openapi.mjs';
import { withMaterialOpenApi } from './material-openapi.mjs';
import { withMeasurementOpenApi } from './measurement-openapi.mjs';
import { withMeasurementRevisionOpenApi } from './measurement-revision-openapi.mjs';
import { withOrderEconomicsOpenApi } from './order-economics-openapi.mjs';
import { withOrderMarginBridgeOpenApi } from './order-margin-bridge-openapi.mjs';
import { withPhysicalActualCostOpenApi } from './physical-actual-cost-openapi.mjs';
import { withProductionExecutionOpenApi } from './production-execution-openapi.mjs';
import { withProductionOrderOpenApi } from './production-order-openapi.mjs';
import { withSampleOpenApi } from './sample-openapi.mjs';
import { withSourcingOpenApi } from './sourcing-openapi.mjs';
import { withSourcingTechPackGateOpenApi } from './sourcing-tech-pack-gate-openapi.mjs';
import { withTechPackOpenApi } from './tech-pack-openapi.mjs';
import { wholesaleV2OpenApi } from './openapi.mjs';

const AUTHORITATIVE_V2_CONTRACT_VERSION = '1.17.0';

const composed = withEcon003AllocationMarginOpenApi(
  withApprovedDemandProductionOpenApi(
    withSupplierEconomicPerformanceOpenApi(
      withSupplierRecoveryOpenApi(
        withReceiptClaimsOpenApi(
          withInventoryOpenApi(
            withPhysicalActualCostOpenApi(
              withFulfillmentOpenApi(
                withCostAllocationOpenApi(
                  withOrderMarginBridgeOpenApi(
                    withCostCloseReadinessOpenApi(
                      withOrderEconomicsOpenApi(
                        withSelectionMatrixOpenApi(
                          withRetailDoorOpenApi(
                            withCommercialPublicationOpenApi(
                              withCollectionStyleVersionOpenApi(
                                withProductReadinessOpenApi(
                                  withProductIdentityOpenApi(
                                    withFinalQualityOpenApi(
                                      withProductionExecutionOpenApi(
                                        withProductionOrderOpenApi(
                                          withSourcingTechPackGateOpenApi(
                                            withTechPackOpenApi(
                                              withSourcingOpenApi(
                                                withSampleOpenApi(
                                                  withMeasurementRevisionOpenApi(
                                                    withMeasurementOpenApi(
                                                      withBomOpenApi(
                                                        withMaterialOpenApi(wholesaleV2OpenApi),
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
);

export const wholesaleV2ExtendedOpenApi = preserveAuthoritativeContractVersion(composed);

function preserveAuthoritativeContractVersion(specification) {
  const normalized = structuredClone(specification);
  normalized.info.version = AUTHORITATIVE_V2_CONTRACT_VERSION;
  return deepFreeze(normalized);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
