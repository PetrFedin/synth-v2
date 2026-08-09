import { wholesaleV2ExtendedOpenApi } from './v2-openapi.mjs';
import { withOrderMarginBridgeOpenApi } from './order-margin-bridge-openapi.mjs';

export const wholesaleV2CompleteOpenApi = withOrderMarginBridgeOpenApi(wholesaleV2ExtendedOpenApi);
