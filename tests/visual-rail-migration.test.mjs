import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql=await readFile(new URL('../db/migrations/179_visual_rail.sql',import.meta.url),'utf8');

test('Visual Rail migration creates one composition authority and immutable published snapshots',()=>{
  for(const fragment of [
    'visual_rail_boards','visual_rails','visual_rail_placements','visual_rail_snapshots',
    "'visual-rail'",'visual_rail_commands','reject_visual_rail_snapshot_mutation',
    'visual_rail_placements_single_product','DEFERRABLE INITIALLY DEFERRED',
  ]) assert.ok(sql.includes(fragment),fragment);
});

test('database guards source lineage and source-product membership',()=>{
  for(const fragment of [
    'validate_visual_rail_board_source','visual_rail_board_showroom_source','visual_rail_board_buyer_catalog_source',
    'validate_visual_rail_placement_source','visual_rail_showroom_product_membership','visual_rail_buyer_product_membership',
  ]) assert.ok(sql.includes(fragment),fragment);
});

test('Visual Rail schema does not create a second product selection order or inventory authority',()=>{
  assert.doesNotMatch(sql,/CREATE TABLE\s+(products|selections|orders|inventor(?:y|ies))\b/i);
});
