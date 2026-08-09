import { wholesaleV2CompleteOpenApi } from './v2-complete-openapi.mjs';
import { withCostAllocationOpenApi } from './cost-allocation-openapi.mjs';

export const wholesaleV2EconomicsOpenApi = withCostAllocationOpenApi(wholesaleV2CompleteOpenApi);
