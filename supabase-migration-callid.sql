-- Adds vapi_call_id to conversations for linking to Vapi call recordings.
alter table conversations add column vapi_call_id text;
