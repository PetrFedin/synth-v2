const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$';
const HASH = '^[0-9a-f]{64}$';
const auth = [{ bearerAuth: [] }];
const id = { type: 'string', minLength: 1, maxLength: 160, pattern: SAFE_ID };
const nullableId = { oneOf: [id, { type: 'null' }] };
const dateTime = { type: 'string', format: 'date-time' };
const nullableDateTime = { oneOf: [dateTime, { type: 'null' }] };
const hash = { type: 'string', pattern: HASH };
const jsonObject = { type: 'object', additionalProperties: true };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const pathId = (name) => ({ name, in: 'path', required: true, schema: id });
const error = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const purposes = ['garment_interpretation','document_ingestion','measurement_assist','bom_assist','construction_assist','technical_flat','sample_review','conflict_review'];
const authorities = ['product_identity','measurement','bom','construction','tech_pack','sample','material','colour','operation_sequence'];
const views = ['front','back','left','right','inside','detail'];
const objectTypes = ['outline','panel','seam','stitch','pocket','closure','collar','cuff','trim','measurement_anchor','construction_callout','dart','pleat','hem','grainline','foldline','notch','button','buttonhole','zipper','annotation'];
const sourceKinds = ['product_media','style_reference','document','spreadsheet','external_uri','sample','manual_observation'];
const ingestModes = ['upload','connector','canonical_asset','manual'];
const fragmentKinds = ['document_page','sheet','cell_range','image_region','text_span','metadata','manual_note'];

export function withProductEngineeringOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  const confidence = { oneOf: [{ type: 'number', minimum: 0, maximum: 1 }, { type: 'null' }] };
  return {
    ProductEngineeringSourceCreate: {
      type:'object', additionalProperties:false, required:['kind','ingestMode'],
      properties:{
        kind:{type:'string',enum:sourceKinds}, ingestMode:{type:'string',enum:ingestModes},
        mediaType:{type:'string'}, originalName:{type:'string',maxLength:260},
        sizeBytes:{type:'integer',minimum:0}, contentHash:hash, storageRef:{type:'string',maxLength:1000},
        sourceUri:{type:'string',maxLength:2000}, metadata:jsonObject,
      },
    },
    ProductEngineeringSourceScan: {
      type:'object', additionalProperties:false, required:['expectedVersion','status'],
      properties:{ expectedVersion:{type:'integer',minimum:1}, status:{type:'string',enum:['clean','infected','error']}, engine:{type:'string'}, details:jsonObject },
    },
    ProductEngineeringSourceAdmit: {
      type:'object', additionalProperties:false, required:['expectedVersion','policyVersion'],
      properties:{ expectedVersion:{type:'integer',minimum:1}, policyVersion:{type:'string'} },
    },
    ProductEngineeringSourceReject: {
      type:'object', additionalProperties:false, required:['expectedVersion','code','message'],
      properties:{ expectedVersion:{type:'integer',minimum:1}, code:{type:'string'}, message:{type:'string',maxLength:2000}, quarantine:{type:'boolean'} },
    },
    ProductEngineeringSourceFragmentCreate: {
      type:'object', additionalProperties:false, required:['kind','locator'],
      properties:{ kind:{type:'string',enum:fragmentKinds}, locator:jsonObject, content:{}, contentHash:hash },
    },
    ProductEngineeringSourceParseComplete: {
      type:'object', additionalProperties:false, required:['expectedVersion','parser','parserVersion','fragmentCount'],
      properties:{ expectedVersion:{type:'integer',minimum:1}, parser:{type:'string'}, parserVersion:{type:'string'}, fragmentCount:{type:'integer',minimum:0} },
    },
    ProductEngineeringSourceWorkspace: {
      type:'object', additionalProperties:false, required:['source','fragments'],
      properties:{ source:{type:'object',additionalProperties:true}, fragments:{type:'array',items:{type:'object',additionalProperties:true}} },
    },
    ProductEngineeringAnalysisCreate: {
      type: 'object', additionalProperties: false, required: ['purpose','inputManifest'],
      properties: { styleVersionId: id, purpose: { type: 'string', enum: purposes }, inputManifest: jsonObject },
    },
    ProductEngineeringAnalysis: {
      type: 'object', additionalProperties: false,
      required: ['id','brandId','styleId','styleVersionId','purpose','status','inputManifest','inputHash','requestedAt','requestedBy','startedAt','completedAt','failureCode','failureMessage','version'],
      properties: {
        id, brandId: id, styleId: id, styleVersionId: nullableId, purpose: { type: 'string', enum: purposes },
        status: { type: 'string', enum: ['queued','running','completed','failed','cancelled'] }, inputManifest: jsonObject,
        inputHash: hash, requestedAt: dateTime, requestedBy: id, startedAt: nullableDateTime, completedAt: nullableDateTime,
        failureCode: { oneOf: [{ type: 'string' }, { type: 'null' }] }, failureMessage: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        version: { type: 'integer', minimum: 1 },
      },
    },
    ProductEngineeringModelRunStart: {
      type: 'object', additionalProperties: false, required: ['provider','model','purpose','promptVersion','schemaVersion','inputHash'],
      properties: {
        provider: { type: 'string' }, model: { type: 'string' }, purpose: { type: 'string', enum: purposes },
        promptVersion: { type: 'string' }, schemaVersion: { type: 'string' }, inputHash: hash,
      },
    },
    ProductEngineeringModelRunComplete: {
      type: 'object', additionalProperties: false, required: ['outputHash'],
      properties: {
        outputHash: hash, usage: jsonObject, costMinor: { oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
        currency: { oneOf: [{ type: 'string', pattern: '^[A-Z]{3}$' }, { type: 'null' }] },
      },
    },
    ProductEngineeringEvidenceInput: {
      type: 'object', additionalProperties: false, required: ['sourceKind'],
      properties: {
        sourceKind: { type: 'string', enum: ['product_media','style_reference','document','spreadsheet','external_uri','manual_observation','sample'] },
        sourceId: id, sourceLocator: jsonObject, sourceHash: hash, excerpt: { type: 'string', maxLength: 2000 },
      },
    },
    ProductEngineeringFindingCreate: {
      type: 'object', additionalProperties: false, required: ['findingType','origin','value'],
      properties: {
        findingType: { type: 'string' }, origin: { type: 'string', enum: ['observed','ai_inferred','document_extracted','rule_derived','unknown'] },
        value: {}, confidence, evidence: { type: 'array', items: { $ref: '#/components/schemas/ProductEngineeringEvidenceInput' } },
      },
    },
    ProductEngineeringProposalCreate: {
      type: 'object', additionalProperties: false, required: ['targetAuthority','targetField','proposedValue'],
      properties: {
        findingId: id, targetAuthority: { type: 'string', enum: authorities }, targetEntityId: id,
        targetField: { type: 'string' }, proposedValue: {}, confidence, rationale: { type: 'string', maxLength: 4000 },
      },
    },
    ProductEngineeringProposalResolve: {
      type: 'object', additionalProperties: false, required: ['expectedVersion','decision'],
      properties: { expectedVersion: { type: 'integer', minimum: 1 }, decision: { type: 'string', enum: ['accepted','rejected'] }, note: { type: 'string', maxLength: 4000 } },
    },
    ProductEngineeringProposalApply: {
      type: 'object', additionalProperties: false, required: ['expectedProposalVersion','expectedCanonicalVersion'],
      properties: {
        expectedProposalVersion: { type: 'integer', minimum: 1 },
        expectedCanonicalVersion: { type: 'integer', minimum: 1 },
      },
      description: 'Applies an already accepted allowlisted proposal through the owning canonical domain command. Acceptance alone never mutates canonical PLM.',
    },
    ProductEngineeringProposalImpact: {
      type:'object', additionalProperties:false,
      required:['proposalId','authority','action','targetEntityId','supported','contextStatus','styleVersionId','impacts','facts'],
      properties:{
        proposalId:id,
        authority:{type:'string',enum:authorities},
        action:{type:'string'},
        targetEntityId:nullableId,
        supported:{type:'boolean'},
        contextStatus:{type:'string',enum:['resolved','unavailable']},
        styleVersionId:nullableId,
        impacts:{
          type:'array',
          items:{
            type:'object',additionalProperties:false,
            required:['area','action','severity','activeDependencyCount','evidence'],
            properties:{
              area:{type:'string'},
              action:{type:'string'},
              severity:{type:'string',enum:['medium','high']},
              activeDependencyCount:{oneOf:[{type:'integer',minimum:0},{type:'null'}]},
              evidence:{
                type:'object',additionalProperties:false,required:['status','present','count','basis'],
                properties:{
                  status:{type:'string',enum:['observed','derived','not_available']},
                  present:{oneOf:[{type:'boolean'},{type:'null'}]},
                  count:{oneOf:[{type:'integer',minimum:0},{type:'null'}]},
                  basis:{oneOf:[{type:'string'},{type:'null'}]},
                },
              },
            },
          },
        },
        facts:{
          type:'object',additionalProperties:false,
          required:['measurementCharts','boms','samples','techPacks','sourcing','productionOrders','qualityInspections','activeProductionOrders','acknowledgedTechPacks'],
          properties:{
            measurementCharts:{type:'integer',minimum:0},boms:{type:'integer',minimum:0},samples:{type:'integer',minimum:0},
            techPacks:{type:'integer',minimum:0},sourcing:{type:'integer',minimum:0},productionOrders:{type:'integer',minimum:0},
            qualityInspections:{type:'integer',minimum:0},activeProductionOrders:{type:'integer',minimum:0},acknowledgedTechPacks:{type:'integer',minimum:0},
          },
        },
      },
    },
    ProductEngineeringApplicationReceipt: {
      type:'object', additionalProperties:false,
      required:['id','intentId','intentHash','proposalId','analysisRunId','findingId','brandId','styleId','actorId','applicationCommandId','canonicalCommandId','targetAuthority','targetEntityId','targetAction','expectedProposalVersion','expectedCanonicalVersion','resultingCanonicalVersion','preconditionHash','deterministicDiff','lineage','resultSnapshot','resultHash','receiptHash','appliedAt'],
      properties:{
        id, intentId:id, intentHash:hash, proposalId:id, analysisRunId:id, findingId:nullableId,
        brandId:id, styleId:id, actorId:id, applicationCommandId:id, canonicalCommandId:id,
        targetAuthority:{type:'string',enum:authorities}, targetEntityId:id, targetAction:{type:'string'},
        expectedProposalVersion:{type:'integer',minimum:1}, expectedCanonicalVersion:{type:'integer',minimum:1}, resultingCanonicalVersion:{type:'integer',minimum:1},
        preconditionHash:hash,
        deterministicDiff:{type:'array',items:{type:'object',additionalProperties:true}},
        lineage:{type:'object',additionalProperties:false,required:['analysisRunId','findingId','evidenceIds','sourceIds','modelRunIds'],properties:{
          analysisRunId:id, findingId:nullableId,
          evidenceIds:{type:'array',items:id}, sourceIds:{type:'array',items:id}, modelRunIds:{type:'array',items:id},
        }},
        resultSnapshot:jsonObject, resultHash:hash, receiptHash:hash, appliedAt:dateTime,
      },
      description:'Immutable proof that an accepted engineering proposal crossed the exact canonical authority/version boundary through the owning domain command.',
    },
    ProductEngineeringConflictCreate: {
      type: 'object', additionalProperties: false, required: ['conflictType','subject','candidates','severity'],
      properties: {
        conflictType: { type: 'string' }, subject: { type: 'string', maxLength: 240 },
        candidates: { type: 'array', minItems: 2, items: {} }, severity: { type: 'string', enum: ['info','warning','blocking'] },
      },
    },
    ProductEngineeringConflictResolve: {
      type: 'object', additionalProperties: false, required: ['expectedVersion','disposition'],
      properties: { expectedVersion: { type: 'integer', minimum: 1 }, disposition: { type: 'string', enum: ['resolved','ignored'] }, resolution: jsonObject },
    },
    TechnicalDrawingCreate: {
      type: 'object', additionalProperties: false, required: ['viewType','svg'],
      properties: { styleVersionId: id, analysisRunId: id, viewType: { type: 'string', enum: views }, svg: { type: 'string', minLength: 20, maxLength: 2000000 } },
    },
    TechnicalDrawingObjectCreate: {
      type: 'object', additionalProperties: false, required: ['objectType','geometry'],
      properties: {
        objectType: { type: 'string', enum: objectTypes }, semanticCode: { type: 'string' }, garmentNodeId: id, geometry: jsonObject,
        linkPayload: jsonObject, confidence,
      },
    },
    ProductEngineeringGarmentGraph: {
      oneOf: [
        { type: 'null' },
        {
          type: 'object', additionalProperties: false,
          required: ['id','analysisRunId','brandId','styleId','schemaVersion','status','contentHash','nodeCount','edgeCount','createdAt','createdBy','reviewedAt','reviewedBy','version','nodes','edges'],
          properties: {
            id, analysisRunId:id, brandId:id, styleId:id, schemaVersion:{type:'string'},
            status:{type:'string',enum:['draft','reviewed','superseded']},
            contentHash:{oneOf:[hash,{type:'null'}]}, nodeCount:{type:'integer',minimum:0}, edgeCount:{type:'integer',minimum:0},
            createdAt:dateTime, createdBy:id, reviewedAt:nullableDateTime, reviewedBy:nullableId,
            version:{type:'integer',minimum:1},
            nodes:{type:'array',items:{type:'object',additionalProperties:true}},
            edges:{type:'array',items:{type:'object',additionalProperties:true}},
          },
        },
      ],
    },
    ProductEngineeringStyleWorkspace: {
      type: 'object', additionalProperties: false, required: ['analyses','proposals','conflicts','drawings','sources','garmentGraph'],
      properties: {
        analyses: { type: 'array', items: { $ref: '#/components/schemas/ProductEngineeringAnalysis' } },
        proposals: { type: 'array', items: { type: 'object', additionalProperties: true } },
        conflicts: { type: 'array', items: { type: 'object', additionalProperties: true } },
        drawings: { type: 'array', items: { type: 'object', additionalProperties: true } },
        sources: { type: 'array', items: { type: 'object', additionalProperties: true } },
        garmentGraph: { $ref: '#/components/schemas/ProductEngineeringGarmentGraph' },
      },
    },
    ProductEngineeringAnalysisWorkspace: {
      type: 'object', additionalProperties: false, required: ['analysis','modelRuns','findings','evidence','proposals','conflicts','drawings'],
      properties: {
        analysis: { $ref: '#/components/schemas/ProductEngineeringAnalysis' },
        modelRuns: { type: 'array', items: { type: 'object', additionalProperties: true } },
        findings: { type: 'array', items: { type: 'object', additionalProperties: true } },
        evidence: { type: 'array', items: { type: 'object', additionalProperties: true } },
        proposals: { type: 'array', items: { type: 'object', additionalProperties: true } },
        conflicts: { type: 'array', items: { type: 'object', additionalProperties: true } },
        drawings: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
  };
}

function paths() {
  const mutation = (operationId, ids, schema = null) => ({
    operationId, security: auth, parameters: [...ids.map(pathId), idempotency],
    ...(schema ? { requestBody: body(schema) } : {}),
    responses: { 200: { description: 'Success' }, 400: error, 401: error, 403: error, 404: error, 409: error, 422: error },
  });
  const read = (operationId, ids, responseSchema, extra = []) => ({
    operationId, security: auth, parameters: [...ids.map(pathId), ...extra],
    responses: { 200: { description: 'Success', content: { 'application/json': { schema: { type: 'object', required: ['data','requestId'], properties: { data: { $ref: responseSchema }, requestId: { type: 'string' } } } } } }, 401: error, 403: error, 404: error },
  });
  return {
    '/product/styles/{styleId}/engineering/upload': {
      post: {
        operationId: 'uploadProductEngineeringSource',
        security: auth,
        parameters: [
          pathId('styleId'),
          idempotency,
          { name:'X-File-Name', in:'header', required:true, schema:{type:'string',minLength:1,maxLength:780} },
        ],
        requestBody: {
          required:true,
          content: {
            'application/pdf': { schema:{type:'string',format:'binary'} },
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema:{type:'string',format:'binary'} },
            'text/csv': { schema:{type:'string',format:'binary'} },
            'image/svg+xml': { schema:{type:'string',format:'binary'} },
            'image/jpeg': { schema:{type:'string',format:'binary'} },
            'image/png': { schema:{type:'string',format:'binary'} },
            'image/webp': { schema:{type:'string',format:'binary'} },
          },
        },
        responses: { 200:{description:'Controlled source persisted with server-computed SHA-256'}, 400:error, 401:error, 403:error, 409:error, 413:error, 422:error },
      },
    },
    '/product/styles/{styleId}/engineering/sources': { post: mutation('registerProductEngineeringSource', ['styleId'], '#/components/schemas/ProductEngineeringSourceCreate') },
    '/product-engineering/sources/{sourceId}': { get: read('getProductEngineeringSource', ['sourceId'], '#/components/schemas/ProductEngineeringSourceWorkspace') },
    '/product-engineering/sources/{sourceId}/scan': { post: mutation('recordProductEngineeringSourceScan', ['sourceId'], '#/components/schemas/ProductEngineeringSourceScan') },
    '/product-engineering/sources/{sourceId}/admit': { post: mutation('admitProductEngineeringSource', ['sourceId'], '#/components/schemas/ProductEngineeringSourceAdmit') },
    '/product-engineering/sources/{sourceId}/reject': { post: mutation('rejectProductEngineeringSource', ['sourceId'], '#/components/schemas/ProductEngineeringSourceReject') },
    '/product-engineering/sources/{sourceId}/fragments': { post: mutation('addProductEngineeringSourceFragment', ['sourceId'], '#/components/schemas/ProductEngineeringSourceFragmentCreate') },
    '/product-engineering/sources/{sourceId}/parse-complete': { post: mutation('completeProductEngineeringSourceParsing', ['sourceId'], '#/components/schemas/ProductEngineeringSourceParseComplete') },
    '/product/styles/{styleId}/engineering/analyses': { post: mutation('requestProductEngineeringAnalysis', ['styleId'], '#/components/schemas/ProductEngineeringAnalysisCreate') },
    '/product/styles/{styleId}/engineering': { get: read('getProductEngineeringStyleWorkspace', ['styleId'], '#/components/schemas/ProductEngineeringStyleWorkspace', [{ name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200 } }]) },
    '/product-engineering/analyses/{analysisRunId}': { get: read('getProductEngineeringAnalysisWorkspace', ['analysisRunId'], '#/components/schemas/ProductEngineeringAnalysisWorkspace') },
    '/product-engineering/analyses/{analysisRunId}/start': { post: mutation('startProductEngineeringAnalysis', ['analysisRunId']) },
    '/product-engineering/analyses/{analysisRunId}/complete': { post: mutation('completeProductEngineeringAnalysis', ['analysisRunId']) },
    '/product-engineering/analyses/{analysisRunId}/model-runs': { post: mutation('startProductEngineeringModelRun', ['analysisRunId'], '#/components/schemas/ProductEngineeringModelRunStart') },
    '/product-engineering/model-runs/{modelRunId}/complete': { post: mutation('completeProductEngineeringModelRun', ['modelRunId'], '#/components/schemas/ProductEngineeringModelRunComplete') },
    '/product-engineering/analyses/{analysisRunId}/findings': { post: mutation('recordProductEngineeringFinding', ['analysisRunId'], '#/components/schemas/ProductEngineeringFindingCreate') },
    '/product-engineering/analyses/{analysisRunId}/proposals': { post: mutation('createProductEngineeringProposal', ['analysisRunId'], '#/components/schemas/ProductEngineeringProposalCreate') },
    '/product-engineering/proposals/{proposalId}/resolve': { post: mutation('resolveProductEngineeringProposal', ['proposalId'], '#/components/schemas/ProductEngineeringProposalResolve') },
    '/product-engineering/proposals/{proposalId}/impact': { get: read('getProductEngineeringProposalImpact', ['proposalId'], '#/components/schemas/ProductEngineeringProposalImpact') },
    '/product-engineering/proposals/{proposalId}/application-receipt': { get: read('getProductEngineeringApplicationReceipt', ['proposalId'], '#/components/schemas/ProductEngineeringApplicationReceipt') },
    '/product-engineering/proposals/{proposalId}/apply': { post: mutation('applyProductEngineeringProposal', ['proposalId'], '#/components/schemas/ProductEngineeringProposalApply') },
    '/product-engineering/analyses/{analysisRunId}/conflicts': { post: mutation('createProductEngineeringConflict', ['analysisRunId'], '#/components/schemas/ProductEngineeringConflictCreate') },
    '/product-engineering/conflicts/{conflictId}/resolve': { post: mutation('resolveProductEngineeringConflict', ['conflictId'], '#/components/schemas/ProductEngineeringConflictResolve') },
    '/product/styles/{styleId}/engineering/drawings': { post: mutation('createTechnicalDrawing', ['styleId'], '#/components/schemas/TechnicalDrawingCreate') },
    '/product-engineering/drawings/{drawingId}/objects': { post: mutation('addTechnicalDrawingObject', ['drawingId'], '#/components/schemas/TechnicalDrawingObjectCreate') },
    '/product-engineering/drawings/{drawingId}/approve': { post: mutation('approveTechnicalDrawing', ['drawingId']) },
  };
}

function body(schema) { return { required: true, content: { 'application/json': { schema: { $ref: schema } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
