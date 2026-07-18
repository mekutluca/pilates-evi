-- Group-lesson series queries filter by group_lesson_id with a date range and
-- order by (date, hour); the composite index serves them as an ordered range
-- scan and makes MAX(date)/latest-appointment lookups a single probe.
create index idx_pe_appointments_group_lesson_date_hour
  on pe_appointments (group_lesson_id, date, hour);

drop index idx_pe_appointments_group_lesson;
