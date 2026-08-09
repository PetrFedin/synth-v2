import { withCostAllocationOpenApi } from './cost-allocation-openapi.mjs';
import { withOrderMarginBridgeOpenApi } from './order-margin-bridge-openapi.mjs';
import { wholesaleV2ExtendedOpenApi } from './v2-openapi.mjs';

export const wholesaleV2CompleteOpenApi = withCostAllocationOpenApi(
  withOrderMarginBridgeOpenApi(wholesaleV2ExtendedOpenApi),
);
