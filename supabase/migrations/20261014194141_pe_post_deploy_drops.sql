-- Drops left over from the Phase 0/1 changes: room capacity (unused since) and the
-- old reschedule-credit RPC (pe_reschedule_appointment spends credits now).
ALTER TABLE public.pe_rooms DROP COLUMN capacity;
DROP FUNCTION public.pe_decrement_reschedule(uuid);
