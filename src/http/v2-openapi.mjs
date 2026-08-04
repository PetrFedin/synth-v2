import { withBomOpenApi } from './bom-openapi.mjs';
import { withMaterialOpenApi } from './material-openapi.mjs';
import { withMeasurementOpenApi } from './measurement-openapi.mjs';
import { withMeasurementRevisionOpenApi } from './measurement-revision-openapi.mjs';
import { withSampleOpenApi } from './sample-openapi.mjs';
import { wholesaleV2OpenApi } from './openapi.mjs';

export const wholesaleV2ExtendedOpenApi = withSampleOpenApi(
  withMeasurementRevisionOpenApi(
    withMeasurementOpenApi(
      withBomOpenApi(
        withMaterialOpenApi(wholesaleV2OpenApi),
      ),
    ),
  ),
);
