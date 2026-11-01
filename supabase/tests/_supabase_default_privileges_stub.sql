-- ELDOBHATÓ (scratch) teszt-stub: a Supabase alapértelmezett táblajogainak
-- emulálása (új public táblák: ALL az anon / authenticated / service_role
-- szerepkörnek). A _bootstrap_stub.sql UTÁN, a migrációk ELŐTT futtatandó,
-- hogy a migrációk explicit REVOKE-jai ugyanúgy hassanak, mint élesben.
-- NEM production.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
