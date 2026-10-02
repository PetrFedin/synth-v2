const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const ROLES = ['owner', 'admin', 'sales', 'production', 'quality', 'buyer', 'finance', 'viewer'];

export function withTeamOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  const nullableTimestamp = { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] };
  const nullableText = { oneOf: [{ type: 'string' }, { type: 'null' }] };
  return {
    TeamRole: { type: 'string', enum: ROLES },
    TeamMember: {
      type: 'object', additionalProperties: false,
      required: ['membershipId', 'userId', 'role', 'status', 'version', 'displayName', 'email', 'accountStatus', 'invitePending', 'inviteExpiresAt', 'updatedAt'],
      properties: {
        membershipId: identifier,
        userId: identifier,
        role: { $ref: '#/components/schemas/TeamRole' },
        status: { type: 'string', enum: ['active', 'inactive'], description: 'Disabling is a status; the membership and its history are never deleted.' },
        version: { type: 'integer', minimum: 1, description: 'Send back as expectedVersion on the next change; a stale value is refused with 409.' },
        displayName: nullableText,
        email: nullableText,
        accountStatus: { oneOf: [{ type: 'string', enum: ['active', 'invited', 'disabled'] }, { type: 'null' }] },
        invitePending: { type: 'boolean' },
        inviteExpiresAt: nullableTimestamp,
        updatedAt: nullableTimestamp,
      },
    },
    TeamRoster: {
      type: 'object', additionalProperties: false, required: ['items', 'actor', 'assignableRoles'],
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/TeamMember' } },
        actor: { type: 'object', additionalProperties: false, required: ['userId', 'role'], properties: { userId: identifier, role: { $ref: '#/components/schemas/TeamRole' } } },
        assignableRoles: { type: 'array', items: { $ref: '#/components/schemas/TeamRole' }, description: 'Roles the caller may grant in this organisation; owner is offered only to an owner.' },
      },
    },
    TeamInvite: {
      type: 'object', additionalProperties: false, required: ['issued', 'expiresAt'],
      properties: {
        issued: { type: 'boolean' },
        expiresAt: nullableTimestamp,
        token: { type: 'string', description: 'One-time invitation token, returned exactly once in the response that issued it and never stored in clear. A replay of the same Idempotency-Key omits it; use reissue-invite for a new one.' },
      },
    },
    TeamChangeResult: {
      type: 'object', additionalProperties: false, required: ['member', 'invite'],
      properties: { member: { $ref: '#/components/schemas/TeamMember' }, invite: { $ref: '#/components/schemas/TeamInvite' } },
    },
    TeamInviteInput: {
      type: 'object', additionalProperties: false, required: ['email', 'role'],
      properties: {
        email: { type: 'string', maxLength: 254 },
        displayName: { type: 'string', maxLength: 160 },
        role: { $ref: '#/components/schemas/TeamRole' },
      },
    },
    TeamRoleChangeInput: {
      type: 'object', additionalProperties: false, required: ['role', 'expectedVersion'],
      properties: { role: { $ref: '#/components/schemas/TeamRole' }, expectedVersion: { type: 'integer', minimum: 1 } },
    },
    TeamVersionedInput: {
      type: 'object', additionalProperties: false, required: ['expectedVersion'],
      properties: { expectedVersion: { type: 'integer', minimum: 1 } },
    },
    AcceptInviteInput: {
      type: 'object', additionalProperties: false, required: ['token', 'password'],
      properties: { token: { type: 'string', pattern: '^swv2i_[A-Za-z0-9_-]{43}$' }, password: { type: 'string', minLength: 12, maxLength: 1024, format: 'password' } },
    },
    AcceptInviteResult: {
      type: 'object', additionalProperties: false, required: ['userId', 'email', 'organisationId'],
      properties: { userId: identifier, email: { type: 'string' }, organisationId: identifier },
    },
  };
}

function paths() {
  const organisationId = { name: 'organisationId', in: 'path', required: true, schema: identifier };
  const userId = { name: 'userId', in: 'path', required: true, schema: identifier };
  const member = [organisationId, userId, idempotency];
  return {
    '/organisations/{organisationId}/team': {
      get: {
        operationId: 'listTeam',
        description: 'Every member of the organisation in every status, for a caller holding membership.manage.',
        security: [{ bearerAuth: [] }],
        parameters: [organisationId],
        responses: responses('#/components/schemas/TeamRoster', false),
      },
    },
    '/organisations/{organisationId}/team/invitations': {
      post: mutation('inviteTeamMember', [organisationId, idempotency], '#/components/schemas/TeamInviteInput', '#/components/schemas/TeamChangeResult',
        'Invites a person with a role. A new account is created without a password and a one-time token is returned once; an existing active account only gains the membership. Only an owner can grant owner.'),
    },
    '/organisations/{organisationId}/team/{userId}/role': {
      post: mutation('changeTeamMemberRole', member, '#/components/schemas/TeamRoleChangeInput', '#/components/schemas/TeamChangeResult',
        'Changes a member role. Refused for the last active owner, for a non-owner touching an owner, and for a member raising their own role.'),
    },
    '/organisations/{organisationId}/team/{userId}/deactivate': {
      post: mutation('deactivateTeamMember', member, '#/components/schemas/TeamVersionedInput', '#/components/schemas/TeamChangeResult',
        'Disables a membership without deleting it. When it was the last active membership of the account, every session is revoked and the account is disabled. Refused for the last active owner and for oneself.'),
    },
    '/organisations/{organisationId}/team/{userId}/reactivate': {
      post: mutation('reactivateTeamMember', member, '#/components/schemas/TeamVersionedInput', '#/components/schemas/TeamChangeResult',
        'Enables a disabled membership again with its previous role.'),
    },
    '/organisations/{organisationId}/team/{userId}/reissue-invite': {
      post: mutation('reissueTeamInvite', member, '#/components/schemas/TeamVersionedInput', '#/components/schemas/TeamChangeResult',
        'Issues a new one-time invitation token for a member who has not set a password yet; earlier tokens stop working.'),
    },
    '/auth/accept-invite': {
      post: {
        operationId: 'acceptInvite',
        description: 'Anonymous. Sets the password for an invited account by the one-time token. Every refusal reason answers with the same AUTH_INVITE_TOKEN_INVALID.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AcceptInviteInput' } } } },
        responses: { 200: dataResponse('#/components/schemas/AcceptInviteResult'), 400: errorResponse, 413: errorResponse, 415: errorResponse },
      },
    },
  };
}

function mutation(operationId, parameters, input, output, description) {
  return {
    operationId,
    description,
    security: [{ bearerAuth: [] }],
    parameters,
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: input } } } },
    responses: responses(output, true),
  };
}

function responses(output, mutationResponse) {
  return {
    200: dataResponse(output),
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    ...(mutationResponse ? { 409: errorResponse, 422: errorResponse } : {}),
  };
}

function dataResponse(reference) {
  return {
    description: 'Success',
    content: {
      'application/json': {
        schema: {
          type: 'object', additionalProperties: false, required: ['data', 'requestId'],
          properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } },
        },
      },
    },
  };
}

function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
