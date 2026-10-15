-- Per-studio switch for WhatsApp messages (daily reminders and schedule-change messages).
-- The Demo studio is off: its trainees are synthetic, their phone numbers may be real.
ALTER TABLE public.pe_organizations
	ADD COLUMN whatsapp_enabled boolean NOT NULL DEFAULT true;

UPDATE public.pe_organizations SET whatsapp_enabled = false WHERE name = 'Demo';
