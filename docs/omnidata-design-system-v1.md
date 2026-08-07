# Omnidata Design System v1

Omnidata Design System v1 (ODS v1) is the visual and interaction contract for every Syntha workspace. Planning, BOM, Measurements, Samples, Sourcing, Tech Packs, Production Orders, Production Executions, Final Quality and future modules must inherit the same typography, controls, tables, surfaces, spacing and bilingual behaviour.

## Source of truth

- `public/omnidata-v14-role-system.css` — canonical design tokens and role/part styling.
- `public/modules/omnidata-v14-role-system.js` — semantic role mapping, structural parts, bilingual normalisation and runtime audit.
- `public/modules/omnidata-v14-components.js` — semantic component classification.
- `public/modules/omnidata-v14-module-adapters.js` and `public/omnidata-v14-module-adapters.css` — shared migration adapters/primitives for legacy markup.
- `/omnidata-v14-role-system.css?v=visual-20260806-14-role-system-1` remains the final stylesheet; `/ui/omnidata-v14-role-system.js?v=visual-20260806-14-role-system-1` remains the final design-system runtime before DOM normalisation and `app-start.js`.

The legacy `v14` public names are compatibility URLs. Runtime identity is `omnidata-design-system-v1`, version `1.0.0`.

## Canonical roles and tokens

ODS exposes exactly seven visual roles: `table`, `filterbar`, `card`, `status`, `inspector`, `button`, `field`. Structural meaning is expressed with `data-ods-part` for page headers, table wrappers, toolbars, tabs, pagination, cards, surfaces, forms, metrics, master-detail layouts, lists, definition grids, timelines, progress, alerts and toasts.

All shared visual values come from `--ods-*` custom properties: typography, colour, spacing, control/row heights, radii, layout widths and elevation. `--odr-*` variables are compatibility aliases and must not become a second token system.

## Module integration rule

A workspace owns business logic, data fetching and semantic structure. It does not own a visual dialect. New or migrated modules should emit explicit `data-ods-role` / `data-ods-part` where possible; legacy classes may be adapted temporarily by the shared ODS runtime.

No new workspace stylesheet may be added to the shell. Loaded UI runtimes must not use `element.style`, `setAttribute('style', ...)`, dynamically created `<style>` nodes, `CSSStyleSheet`, `adoptedStyleSheets` or `insertRule()`.

`validate:ods-boundaries` freezes the historical shell debt allowlist at 22 legacy stylesheets. Migrations may remove those entries without changing the ceiling; additions fail verification. With Final Quality, Production Orders and Production Executions migrated, only **20 of the historical 22** entries remain loaded. The debt count must only move down.

## Shared progress primitive

Readiness/completion is now a reusable ODS primitive rather than a module-level CSS exception. `public/omnidata-v14-module-adapters.css` provides a token-driven native `<progress>` treatment using `--ods-color-border` and `--ods-color-accent`, plus semantic `progress / progress-track / progress-fill` support. A generic six-step compatibility bridge handles legacy step-based progress without naming a Production module.

Planning, Styles, Materials, BOM and Measurements already store readiness as native `progress.max/value`. Production Executions keeps its business runtime intact while its semantic progress fill is interpreted by the same shared primitive.

## ODS-native workspaces

Final Quality is ODS-native: header, KPI, master-detail layout, filters, toolbar, table, inspector, status tones and alerts inherit shared ODS parts; `final-quality.css` is not loaded or served.

Production Orders is ODS-native: page header/actions, KPI metrics, filters, create/confirm controls, master-detail layout, table/registry, inspector, facts, cards, statuses, empty states and alerts are mapped by the shared adapter; `production-orders.css` is not loaded or served.

Production Executions is the third ODS-native PLM workspace. KPI metrics, filters, create/actions, master-detail layout, table/registry, inspector, facts, cards, statuses, timeline/milestones, alerts and progress inherit shared ODS semantics; `production-executions.css` is not loaded or served.

The migration pattern for remaining modules is: establish reusable semantic coverage first, verify behavior, then remove the module stylesheet. Never copy old module selectors into the canonical ODS stylesheet; add/improve a reusable role, part or shared primitive instead.

## Bilingual behaviour

Visible UI is strictly Russian or English according to selected locale. New user-facing strings continue through the shared i18n runtime; ODS additionally normalises legacy aliases and audits mixed-language UI. Established domain abbreviations such as PLM, BOM, SKU, POM, MOQ, ATS, RFQ, PO, ERP, WMS, PIM, OMS, QC, QMS and API may remain unchanged. Business data must not be translated by the visual normaliser.

## Runtime diagnostics

Useful audit targets include `document.documentElement.dataset.odsName`, `odsVersion`, `odsLanguageAudit` and `window.SynthaOmnidataDesignSystemV1`. `SynthaOmnidataV14RoleSystem` remains a compatibility alias.

## Validation

Run `npm run verify`. It includes `validate:design-system` and `validate:ods-boundaries`, checking metadata/load order, tokens, seven roles, semantic parts, bilingual hooks, CSP-safe markup, the frozen stylesheet boundary, absence of dynamic UI styling, shared progress primitives and ODS-native delivery of Production Executions, Production Orders and Final Quality.

Node.js 22 or newer is required.

## Rule for future workspaces

A new workspace is acceptable when its business markup can be added without inventing another font scale, button system, table system, status system, inspector treatment, stylesheet or translation layer. If a new interaction pattern is genuinely reusable, add it to ODS as a shared role/part/component rather than styling one module locally.
