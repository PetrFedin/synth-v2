# Supplier sourcing and production allocation

## Scope

This module closes the industrial workflow from supplier onboarding to a production commitment:

1. create and maintain a supplier master record;
2. qualify the supplier against audit validity, categories and supported Incoterms;
3. create an RFQ only for a published SKU with a published BOM;
4. issue the RFQ to qualified suppliers;
5. record supplier quotations in the BOM currency using integer minor units;
6. compare quotations by total cost and lead time;
7. award one valid quotation;
8. create a purchase-order reference and allocate the full awarded quantity to production.

The workflow is not considered complete at quotation selection. The terminal successful state is `allocated`; the alternative terminal state is `cancelled`.

## Aggregate lifecycles

### Supplier

`draft -> qualified -> suspended -> qualified`

`draft -> archived`

`suspended -> archived`

A qualified supplier cannot be archived directly. It must first be suspended with a reason. Qualification requires a non-expired audit, at least one category and at least one supported Incoterm.

### RFQ

`draft -> issued -> quoted -> awarded -> allocated`

`draft|issued|quoted|awarded -> cancelled`

An allocated RFQ cannot be cancelled. Production allocation must cover the complete awarded quantity and must be assigned to the awarded supplier.

## Authoritative controls

- The server captures immutable SKU and BOM version snapshots at RFQ creation.
- RFQ issue is blocked when the current SKU or BOM no longer matches the captured snapshot.
- Only qualified suppliers belonging to the same brand may be invited, quoted, awarded or allocated.
- Supplier audit validity must extend through the requested delivery date.
- Quotation totals are calculated on the server as `unitPriceMinor * targetQuantity + fixedCostMinor`.
- A late quotation, expired award, unmet MOQ, partial allocation or late allocation is rejected.
- Every mutation requires an idempotency key and re-authorises the actor before replaying a stored result.
- Optimistic concurrency is enforced with `expectedVersion`.
- Domain events and command results are persisted in the same PostgreSQL transaction.
- Supplier and RFQ reads are organisation-scoped and use repeatable-read snapshots for cursor pagination.

## Permissions

- `owner` and `admin`: full supplier, sourcing, award and production-allocation access.
- `sales`: supplier and sourcing read access.
- `finance`: BOM, supplier and sourcing read access.
- Other roles receive no sourcing access unless the access-control matrix is explicitly extended.

The implementation deliberately does not introduce a new database membership role. This avoids a schema and identity-model divergence between the API, UI and existing membership constraints.

## API

### Suppliers

- `GET /v2/suppliers`
- `GET /v2/suppliers/{supplierCode}`
- `POST /v2/suppliers`
- `PATCH /v2/suppliers/{supplierCode}`
- `POST /v2/suppliers/{supplierCode}/qualify`
- `POST /v2/suppliers/{supplierCode}/suspend`
- `POST /v2/suppliers/{supplierCode}/archive`

### RFQs

- `GET /v2/rfqs`
- `GET /v2/rfqs/{rfqCode}`
- `POST /v2/rfqs`
- `PATCH /v2/rfqs/{rfqCode}`
- `POST /v2/rfqs/{rfqCode}/issue`
- `POST /v2/rfqs/{rfqCode}/quotes`
- `POST /v2/rfqs/{rfqCode}/award`
- `POST /v2/rfqs/{rfqCode}/allocate`
- `POST /v2/rfqs/{rfqCode}/cancel`

All mutation endpoints require `Idempotency-Key`. Update and transition bodies require `expectedVersion`.

## Persistence

Migration `019_supplier_sourcing.sql` adds:

- `suppliers` as the authoritative supplier aggregate projection;
- `sourcing_rfqs` as the authoritative RFQ aggregate projection;
- relational projections for status, brand, SKU, versions, deadlines and selected supplier;
- JSON projection consistency checks;
- lifecycle timestamp constraints;
- organisation/status/deadline indexes;
- GIN indexes for supplier categories and invited supplier codes.

## User interface

The former planned placeholders are replaced by four working views:

- Suppliers: registry, qualification, suspension, requalification and archival;
- RFQ: creation, editing, issue, deadline visibility and cancellation;
- Quotations: ranked comparison with BOM unit-cost variance;
- Production: awarded RFQs, PO creation and final production allocation.

Every visible action has a concrete API route, application command, domain transition, persistence path and automated test.

## Verification

The module is covered by:

- domain lifecycle and rejection tests;
- command idempotency, authorisation and outbox tests;
- cursor and organisation-scoped query tests;
- route and OpenAPI contract tests;
- PostgreSQL migration/store/reader contract tests;
- runtime wiring tests;
- UI action, endpoint and asset registration tests.

Run the complete project gate with:

```bash
npm run verify
```
