# Låsia AS internapp

MVP for ordre, kalender, timeføring og CSV-eksport for Låsia AS.

## Oppsett

1. Kjør SQL i `supabase/schema.sql` i Supabase for ny database.
2. For eksisterende database: kjør migrasjonene nevnt under `Oppgave 1-migrering`.
3. Legg miljøvariabler i Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ypaucjulcfutkwrlhyfs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=din_anon_key
```

4. Opprett første bruker i Supabase Auth og sett den til admin:

```sql
update public.profiles set role = 'admin' where email = 'din-admin@lasia.no';
```

## Ordreflyt

Ordrestatusene er nå:

1. `planning` - Til planlegging
2. `scheduled` - Planlagt
3. `in_progress` - Pågår
4. `completed_pending_invoice` - Ferdig - til fakturering
5. `invoiced_archived` - Fakturert / arkiv

Flyt:

- Admin kan opprette ordre uten dato og ansatt. Den havner i `Til planlegging`.
- Admin kan planlegge ordre med ansatt, dato, starttid og estimert varighet.
- Planlagt ordre vises i kalenderen til valgt ansatt.
- Ansatt kan sette ordre til `Pågår`.
- Ansatt kan føre timer og huke av `Marker ordre som ferdig`.
- Ferdigmeldte ordre vises i adminfanen `Til fakturering`.
- Admin kan trykke `Marker som fakturert`.
- Fakturerte ordre ligger i `Arkiv` og vises ikke i aktiv kalender.

## MVP

- Admin oppretter ordre og tildeler ansatt.
- Ansatt ser egne ordre i oversikt og kalender.
- Ansatt fører timer.
- Admin godkjenner timer og eksporterer CSV.
- Tripletex integreres senere via `orders.tripletex_id` og CSV/serverside API.

## Oppgave 1-migrering

Disse endringene er kjørt i Supabase-prosjektet:

```sql
alter type public.order_status add value if not exists 'planning';
alter type public.order_status add value if not exists 'scheduled';
alter type public.order_status add value if not exists 'in_progress';
alter type public.order_status add value if not exists 'completed_pending_invoice';
alter type public.order_status add value if not exists 'invoiced_archived';

alter table public.orders alter column order_date drop not null;
alter table public.orders add column if not exists scheduled_start timestamptz;
alter table public.orders add column if not exists scheduled_end timestamptz;
alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders add column if not exists completed_by uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists invoiced_at timestamptz;
alter table public.orders add column if not exists invoiced_by uuid references public.profiles(id) on delete set null;
```
