-- A new version of an approved template. Editing an approved template's text in place would
-- make it unsendable for the whole review (Meta answers #132001 while it is PENDING), so the
-- app submits the new text as a separate template that points at the one it replaces. The
-- old one keeps sending; once the new one is approved, the status sync (the WhatsApp page, and
-- the daily reminder before it sends) moves the messages over and removes the old row.

alter table public.pe_wa_templates add column replaces_id uuid;

-- Same studio only; removing the replaced template just clears the link
alter table public.pe_wa_templates
	add constraint pe_wa_templates_replaces_fk
	foreign key (organization_id, replaces_id)
	references public.pe_wa_templates (organization_id, id)
	on delete set null (replaces_id);

-- One waiting version per template
create unique index pe_wa_templates_replaces_once
	on public.pe_wa_templates (replaces_id)
	where replaces_id is not null;
