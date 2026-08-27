-- ==============================================
-- AyuLink - General Practitioner Specialty
--
-- Adds "General Practitioner" to the canonical "Specialty" reference
-- table (see 20260827000000_specialties_and_filters.sql). Not a narrow
-- specialty in the clinical sense — it's the default/common-case bucket
-- the doctor_finder agent now routes to instead of a specialist when a
-- patient's complaint looks like an everyday, non-specific ailment (see
-- src/agent_workflow/retrevel/subagents/doctor_finder.py). Matches the
-- same specialty seeded into the Neo4j knowledge graph (Specialty and
-- Clinical Taxonomy Dataset.csv) for AI/manual search consistency.
-- ==============================================

insert into "Specialty" ("name") values
    ('General Practitioner')
on conflict ("name") do nothing;
