# Omnidata Design System v1

Omnidata Design System v1 (ODS v1) is the visual and interaction contract for every Syntha workspace. Planning, BOM, Measurements, Samples, Sourcing, Tech Packs, Production Orders, Production Executions, Final Quality and future modules must inherit the same typography, controls, tables, surfaces, spacing and bilingual behaviour.

## Source of truth

The current compatibility entry points remain:

- `public/omnidata-v14-role-system.css` — canonical design tokens and role/part styling.
- `public/modules/omnidata-v14-role-system.js` — semantic role mapping, structural parts, bilingual normalisation and runtime audit.
- `/omnidata-v14-role-system.css?v=visual-20260806-14-role-system-1` — final stylesheet in the shell.
- `/ui/omnidata-v14-role-system.js?v=visual-20260806-14-role-system-1` — final design-system runtime before DOM normalisation and `app-start.js`.

The legacy `v14` public names are compatibility URLs. The runtime identity is `omnidata-design-system-v1`, version `1.0.0`.

## Canonical roles

ODS v1 intentionally exposes exactly seven visual roles:

- `table`
- `filterbar`
- `card`
- `status`
- `inspector`
- `button`
- `field`

Runtime markup uses `data-ods-role`. `data-od14-unified-role` is retained only as a compatibility alias during migration.

Structural meaning is expressed with `data-ods-part`, including page headers, table wrappers, toolbars, tabs, pagination, cards, surfaces, forms, metrics, master-detail layouts, lists, definition grids, timelines, progress, alerts and toasts.

## Tokens

All shared visual values come from `--ods-*` custom properties. The current contract includes:

- typography: font family, type sizes and line height;
- colour: workspace, sidebar, surfaces, text, borders, accent and semantic states;
- spacing: `--ods-space-1` through `--ods-space-6`;
- controls: shared control and table-row heights;
- shape: small, medium and large radii;
- layout: content max width and inspector width;
- elevation: shared surface shadow.

`--odr-*` variables are compatibility aliases and must not be expanded into a second token system.

## Module integration rule

A workspace owns business logic, data fetching and semantic structure. It does not own its own visual dialect.

New or migrated modules must expose semantic structure that ODS can classify. Prefer explicit `data-ods-role` and `data-ods-part` when the component is created. The ODS runtime may adapt legacy classes during migration, but that is not the target architecture.

No new workspace stylesheet may be added to the shell. New modules must inherit ODS through semantic roles/parts and shared tokens. Loaded UI runtimes must not use `element.style`, `setAttribute('style', ...)`, dynamically created `<style>` nodes, `CSSStyleSheet`, `adoptedStyleSheets` or `insertRule()`.

Existing local stylesheets are migration debt, not an extension point. `validate:ods-boundaries` freezes the current shell debt at a maximum of 22 legacy stylesheets. A migration may remove a frozen stylesheet without changing the baseline; adding another stylesheet fails verification. The debt count is therefore intended to move in one direction only: down.

The final ODS stylesheet must remain after every legacy stylesheet. The ODS runtime must remain after all workspace runtimes, before `dom-boolean-props.js`, and `app-start.js` must remain the final script.

## First ODS-native workspace

Final Quality is the first PLM workspace whose local visual stylesheet has been retired. Its business runtime remains `public/modules/final-quality.js`, while header, KPI, master-detail layout, filters, toolbar, table, inspector, status tones and alerts are mapped to reusable ODS parts by `public/modules/omnidata-v14-role-system.js`.

This is the migration pattern for the remaining modules: establish semantic coverage first, verify shared behaviour, then remove the module stylesheet from the shell and static handler. Do not move its old visual declarations into ODS under module-specific selectors; add or improve a reusable semantic part instead.

## Bilingual behaviour

Visible UI is strictly Russian or English according to the selected locale. New user-facing strings should continue to use the shared i18n runtime. The ODS runtime additionally normalises legacy aliases and audits mixed-language interface text.

Technical abbreviations such as PLM, BOM, SKU, POM, MOQ, ATS, RFQ, PO, ERP, WMS, PIM, OMS, QC, QMS, API and standard currency/transport abbreviations may remain unchanged where they are the established domain term.

Business data must not be translated by the visual normaliser.

## Runtime diagnostics

The ODS runtime exposes compatibility and diagnostic state on the document/root runtime, including the ODS name/version and language audit. The browser API is available through `SynthaOmnidataDesignSystemV1`; `SynthaOmnidataV14RoleSystem` remains a compatibility alias.

Useful audit targets include:

- `document.documentElement.dataset.odsName`
- `document.documentElement.dataset.odsVersion`
- `document.documentElement.dataset.odsLanguageAudit`
- `window.SynthaOmnidataDesignSystemV1`

## Validation

Run:

```bash
npm run verify
```

`verify` includes `validate:design-system` and `validate:ods-boundaries`. Together they check ODS metadata, final load order, canonical tokens, seven roles, semantic parts, bilingual runtime hooks, self-contained CSS, absence of module-specific selectors in the ODS stylesheet, CSP-safe shell markup, the frozen legacy stylesheet boundary, prohibition of dynamic UI styling and ODS-native delivery of Final Quality.

Node.js 22 or newer is required by the repository.

## Rule for future workspaces

A new workspace is acceptable when its business markup can be added without inventing another font scale, button system, table system, status system, inspector treatment, stylesheet or translation layer. If a new interaction pattern is genuinely reusable, add it to ODS as a shared role/part/component rather than styling one module locally.
