-- Forward-only reconciliation after operational collaboration extended command_registry.
-- Migration 172 is already part of main and must remain immutable for databases that applied it.
-- This migration restores Product Engineering while preserving Operational Collaboration.

ALTER TABLE command_registry
  DROP CONSTRAINT IF EXISTS command_registry_scope_check;
ALTER TABLE command_registry
  ADD CONSTRAINT command_registry_scope_check
  CHECK (scope IN (
    'wholesale','catalog','notification','product-identity','product-readiness',
    'legal-entity','material-sourcing','compliance-document','product-certification',
    'product-engineering','operational-collaboration'
  ));
