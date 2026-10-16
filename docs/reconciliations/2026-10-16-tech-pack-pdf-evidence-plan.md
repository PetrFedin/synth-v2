# Canonical Tech Pack PDF evidence plan — 2026-10-16

**Status:** Candidate only. Stacked on exact-green Tech Pack browser-viewer PR #299. No API route, no Print button, no PDF bytes.

## Purpose

The manufacturer must receive an exact issued Tech Pack, not a document reassembled from mutable Product Master, MDM, current BOM, sample, measurement or media aliases. This implementation introduces a pure content-evidence plan, not an exporter.

Input is one already authenticated, rights-gated canonical document envelope from the PostgreSQL reader:
- immutable document with verified SHA-256 and frozen source version IDs;
- current rights admission evaluated in the same server-side repeatable-read snapshot.

The planner verifies hashes, admission status, every issued/current media decision and exact size matrix identities; it emits deterministic RU/EN content sections and asset requirements with its own SHA-256 planHash. No live references are resolved.

Sections: issued identity and supplier; retained sketch references; BOM without currency/quantity rounding; Measurement Chart keyed by frozen Product SizeValue IDs; approved PPS; operations and standard times; quality/production/packing instructions; provenance hashes and source version IDs.

## Explicitly not delivered

- no PDF bytes, rendered pages, native print interception or public download;
- no media-store retrieval or verified raw image byte hashes;
- no licensed embedded Cyrillic/Latin font program or glyph coverage assertion;
- no deterministic page breaks or visual clipping QA;
- no final PDF bytes hash, signing or export token;
- no fresh rights check at a future download/export boundary.

**Release rule:** No PDF/print admission until each gate above has real automated + visual evidence on the exact head, independent review, and protected integration. Retained asset storage keys are not permission to fetch and the plan/policy hash is not authorization.
