import { withBomOpenApi } from './bom-openapi.mjs';
import { withCommercialPublicationOpenApi } from './commercial-publication-openapi.mjs';
import { withCostAllocationOpenApi } from './cost-allocation-openapi.mjs';
import { withCostCloseReadinessOpenApi } from './cost-close-readiness-openapi.mjs';
import { withFinalQualityOpenApi } from './final-quality-openapi.mjs';
import { withFulfillmentOpenApi } from './fulfillment-openapi.mjs';
import { withInventoryOpenApi } from './inventory-openapi.mjs';
import { withReceiptClaimsOpenApi } from './receipt-claims-openapi.mjs';
import { withSupplierRecoveryOpenApi } from './supplier-recovery-openapi.mjs';
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

export const wholesaleV2ExtendedOpenApi = withSupplierRecoveryOpenApi(
  withReceiptClaimsOpenApi(
    withInventoryOpenApi(
      withPhysicalActualCostOpenApi(
        withFulfillmentOpenApi(
          withCostAllocationOpenApi(
            withOrderMarginBridgeOpenApi(
              withCostCloseReadinessOpenApi(
                withOrderEconomicsOpenApi(
                  withCommercialPublicationOpenApi(
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
);
