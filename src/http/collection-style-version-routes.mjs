import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const ASSIGN_STYLE_VERSION_BODY = bodyContract(['styleVersionId']);

export function createCollectionStyleVersionRoutes({ platform } = {}) {
  invariant(
    platform && typeof platform.assignStyleVersionToCollection === 'function',
    'COLLECTION_STYLE_VERSION_SERVICE_REQUIRED',
    'Collection Style Version assignment service is required',
  );

  return Object.freeze([
    Object.freeze({
      method: 'POST',
      pattern: /^\/v2\/collections\/([^/]+)\/style-versions$/,
      mutation: true,
      execute(context) {
        assertQueryContract(context.query ?? {}, []);
        assertBodyContract(context.body, ASSIGN_STYLE_VERSION_BODY);
        return platform.assignStyleVersionToCollection(
          context.commandId,
          context.actorId,
          Object.freeze({
            collectionId: context.params[0],
            styleVersionId: context.body.styleVersionId,
          }),
        );
      },
    }),
  ]);
}
