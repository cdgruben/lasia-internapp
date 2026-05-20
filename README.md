# Låsia AS internapp

MVP for ordre, kalender, timeføring og CSV-eksport for Låsia AS.

## Oppsett

1. Kjør SQL i `supabase/schema.sql` i Supabase for ny database.
2. For eksisterende database: kjør migrasjonene nevnt under `Oppgave 1-migrering` og `Oppgave 2-migrering`.
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

## Timeføring

Ansatt kan velge metode per timeføring:

1. `time_range` - Fra-til klokkeslett. Starttid og sluttid lagres, og timer beregnes automatisk.
2. `manual` - Manuelt antall timer. Starttid og sluttid er tomme, kun timer lagres.

Validering:

- Sluttid må være etter starttid ved fra-til.
- Timer må være større enn 0.
- Maks 24 timer per føring.
- Kommentar og arbeidstype er beholdt.

CSV-eksporten inneholder kolonnen `metode`, slik at man ser om føringen er gjort med klokkeslett eller manuelt.

## MVP

- Admin oppretter ordre og tildeler ansatt.
- Ansatt ser egne ordre i oversikt og kalender.
- Ansatt fører timer med klokkeslett eller manuelt timeantall.
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

## Oppgave 2-migrering

Disse endringene er kjørt i Supabase-prosjektet:

```sql
create type public.time_entry_method as enum ('time_range', 'manual');

alter table public.time_entries add column if not exists entry_method public.time_entry_method not null default 'time_range';
alter table public.time_entries alter column start_time drop not null;
alter table public.time_entries alter column end_time drop not null;

alter table public.time_entries drop constraint if exists time_entries_hours_check;
alter table public.time_entries add constraint time_entries_hours_check check (hours > 0 and hours <= 24);

alter table public.time_entries add constraint time_entries_method_time_check check (
  (entry_method = 'time_range' and start_time is not null and end_time is not null and end_time > start_time)
  or
  (entry_method = 'manual')
);

create index if not exists time_entries_entry_method_idx on public.time_entries(entry_method);
```

## Test Oppgave 2

1. Logg inn som ansatt.
2. Åpne en planlagt ordre og gå til timeføring.
3. Velg `Fra-til klokkeslett`, sett start og slutt, og kontroller at timer beregnes automatisk.
4. Prøv sluttid før starttid og sjekk at appen stopper lagring.
5. Velg `Manuelt antall timer` og sjekk at kun timefeltet vises.
6. Prøv 0, negativt tall og over 24 timer. Appen skal stoppe lagring.
7. Lagre en gyldig manuell føring.
8. Logg inn som admin og eksporter CSV. Kontroller at `metode` er med, og at manuelle føringer har tom start/slutt.
