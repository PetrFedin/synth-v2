import { withBomOpenApi } from './bom-openapi.mjs';
import { withCommercialPublicationOpenApi } from './commercial-publication-openapi.mjs';
import { withFinalQualityOpenApi } from './final-quality-openapi.mjs';
import { withMaterialOpenApi } from './material-openapi.mjs';
import { withMeasurementOpenApi } from './measurement-openapi.mjs';
import { withMeasurementRevisionOpenApi } from './measurement-revision-openapi.mjs';
import { withOrderEconomicsOpenApi } from './order-economics-openapi.mjs';
import { withProductionExecutionOpenApi } from './production-execution-openapi.mjs';
import { withProductionOrderOpenApi } from './production-order-openapi.mjs';
import { withSampleOpenApi } from './sample-openapi.mjs';
import { withSourcingOpenApi } from './sourcing-openapi.mjs';
import { withSourcingTechPackGateOpenApi } from './sourcing-tech-pack-gate-openapi.mjs';
import { withTechPackOpenApi } from './tech-pack-openapi.mjs';
import { wholesaleV2OpenApi } from './openapi.mjs';

export const wholesaleV2ExtendedOpenApi = withOrderEconomicsOpenApi(
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
);