-- Apply only after the Phase 0/1 code is deployed: the previous app version still
-- reads pe_rooms.capacity and calls pe_decrement_reschedule. Move into migrations/
-- under its live version once applied.
ALTER TABLE public.pe_rooms DROP COLUMN capacity;
DROP FUNCTION public.pe_decrement_reschedule(uuid);
