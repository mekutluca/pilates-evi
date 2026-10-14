# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## What it is

Pilates Evi is a studio-management app for pilates studios: it sells lesson packages to clients, places those lessons on a weekly calendar of rooms and trainers, and keeps everyone informed when lessons move. It is built as a product for many studios (each studio is an organization); ASI GYM Bağlıca is the first and currently only live studio, with a Demo organization for trials.

## Users

- **Coordinators (front desk, role `coordinator`).** The primary user. They work mostly at a desk computer, often with a client standing in front of them or on the phone: registering a client into a package and weekly time slots, renewing a package that is running out, moving a lesson, closing a day for a holiday. They do all scheduling work but do not manage the catalog (rooms, trainers, packages) or staff accounts.
- **Studio admins (owner/manager, role `admin`).** Everything coordinators do, plus rooms, trainers, packages and staff accounts. Admins reschedule without spending a client's reschedule credit.
- **Trainers (role `trainer`).** Read-only: their own week and today's lessons with who attends.
- **Trainees (role `trainee`).** The role exists, but there is no trainee-facing view yet; a client portal is probable future work.

Phones are secondary for staff; the desk computer is the main device.

## Product Purpose

Replace the studio's paper/WhatsApp scheduling with one place where packages, weekly slots and changes are correct by construction: no double-booked room or trainer, no over-full group, no client silently left out when a lesson moves. Success is a coordinator finishing a desk conversation ("renew Ayşe, same days, but Thursday instead of Tuesday") in a minute, with the client informed automatically.

## Positioning

Built around how a pilates studio actually sells: a client buys a package of N weeks at a fixed weekly pattern (e.g. Tue/Thu 10:00, a given trainer and room), or joins a recurring group lesson with a capacity. Packages chain into renewals, reschedule credits are part of the package, and clients are informed over WhatsApp in Turkish. Generic booking tools model single appointments; this models recurring series.

## Operating Context

- Lessons are one hour, booked on the hour; live data uses roughly 13:00–20:00, seven days a week.
- A studio has a few rooms (3 live) and trainers (6 live) and on the order of 100 active clients.
- Private lessons: one client or a small fixed team sharing a purchase. Group lessons: a recurring series with a package capacity, generated 26 weeks ahead and topped up weekly.
- Client communication is WhatsApp (Chakra API) using approved Turkish templates: reschedule by studio (with a cause), reschedule by client request, and a daily reminder for tomorrow's lessons.
- Time is Turkish time (Europe/Istanbul).

## Capabilities and Constraints

- Package catalog (private / group), rooms, trainers, staff accounts (admin only).
- Registration of a client into a package with weekly slots, multiple periods at once; joining group lesson time slots; creating a new group lesson.
- Renewal (extension) chaining purchases; reschedule credits per purchase (unlimited = 999); coordinators need 23 h notice and a credit to move a client's lesson.
- Moving lessons: one lesson, a series by weeks or by slots, room/trainer transfer, one trainee within a group; cancelling a lesson; closing a whole day; ending a group lesson; deleting a client's remaining lessons.
- Conflict, capacity and duplicate-enrollment checks; database constraints make double-booking impossible.
- The Supabase project is shared with other apps; everything of this product is `pe_`-prefixed.
- **Turkish only** today; all UI copy is Turkish.
- **Payments and prices are future work**: not in the product now, but the model should not make adding package prices and paid/unpaid tracking hard.
- **Trainee portal is future work**: keep the role; build no trainee views yet.

## Terminology

The product glossary (UI must use these consistently):

- **Paket**: a sellable catalog item (private or group).
- **Kayıt**: a client's purchase of a package, renewals included as a chain.
- **Randevu**: one scheduled lesson occurrence; "ders" only in counts ("5 ders kaldı").
- **Grup Dersi**: a recurring group lesson series.
- **Taşı**: moving lessons (one, from this one on, or a whole series; time, room or trainer).
- **İptal et**: remove a lesson. **Günü kapat**: close a day and shift its lessons. **Vazgeç**: dismiss.
- **Arşivle**: soft-remove (restorable). **Sil**: permanent.

## Brand Commitments

- Product name **Pilates Evi**. No logo beyond `static/favicon.svg`; no company identity beyond the name.
- Each studio has its own name (organization); the product must not present one studio's identity as the product's.
- WhatsApp message wording is fixed by approved templates; the app supplies template fields, not free text.

## Evidence on Hand

- Live studio data (one studio). No testimonials, customer list, metrics or pricing exist; do not invent them.

## Product Principles

1. **The client is the unit of work.** Every package action starts from the client; the calendar is for slot-level work.
2. **Correct by construction.** Prevent conflicts, over-full groups and half-applied changes rather than warn after the fact; show impact before irreversible changes.
3. **Nobody is surprised.** When a lesson moves, the affected clients are told, and the coordinator sees who will be told before confirming.
4. **One word, one meaning.** The glossary above is binding across screens, buttons and messages.
5. **Desk speed.** Common conversations (register, renew, move) finish in a few steps without hunting through the calendar.

## Accessibility & Inclusion

No formal standard set. Practical floor: keyboard-usable flows on desktop, labelled controls, status not conveyed by color alone.
