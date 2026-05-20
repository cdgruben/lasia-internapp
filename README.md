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

## Planlegging

Adminfanen `Planlegging` har nå:

- Venstre side med ordre som har status `planning`.
- Knapp `Planlegg` på hver ordre.
- Skjema for ansatt, dato, starttid og estimert varighet.
- Høyre side med ukeplan per ansatt.
- Når en ordre planlegges, får den status `scheduled`, forsvinner fra `Til planlegging` og vises i kalender/ukeplan.

Det er ikke lagt til drag-and-drop i denne MVP-runden. Datamodellen bruker `scheduled_start`, `scheduled_end` og `assigned_employee_id`, så drag-and-drop kan bygges på senere uten ny hovedstruktur.

## Adminmeny

Adminnavigasjonen er nå ryddet til disse hovedpunktene:

- Dashboard
- Ordre
- Planlegging
- Til fakturering
- Arkiv
- Timer/eksport

Ansattvisningen beholder egen `Kalender`, siden ansatte fortsatt trenger dag-/ukevisning for egne jobber.

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

## Databaseskjema

Supabase-skjemaet er verifisert for oppgave 5.

Ordre støtter:

- `planning`
- `scheduled`
- `in_progress`
- `completed_pending_invoice`
- `invoiced_archived`
- `scheduled_start`
- `scheduled_end`
- `completed_at`
- `completed_by`
- `invoiced_at`
- `invoiced_by`

Timeføring støtter:

- `entry_method` med `time_range` og `manual`
- `start_time` som kan være tom ved manuell føring
- `end_time` som kan være tom ved manuell føring
- `hours` med validering større enn 0 og maks 24

`supabase/schema.sql` er oppdatert for ny database. Eksisterende Supabase-prosjekt er allerede migrert gjennom oppgave 1 og 2.

## MVP

- Admin oppretter ordre og tildeler ansatt.
- Admin planlegger ordre i egen planleggingsfane.
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

## Oppgave 3-migrering

Ingen ny SQL kreves. Oppgave 3 bruker eksisterende felter:

- `orders.assigned_employee_id`
- `orders.order_date`
- `orders.scheduled_start`
- `orders.scheduled_end`
- `orders.estimated_hours`
- `orders.status`

## Oppgave 4-migrering

Ingen ny SQL kreves. Oppgave 4 endrer kun adminnavigasjonen.

## Oppgave 5-migrering

Ingen ny SQL ble kjørt. Databasen ble kontrollert mot kravene, og alle nødvendige felter finnes allerede fra oppgave 1 og 2.

Verifisert i Supabase:

- `orders.status` støtter de nye statusene.
- `orders` har `scheduled_start`, `scheduled_end`, `completed_at`, `completed_by`, `invoiced_at` og `invoiced_by`.
- `time_entries.entry_method` støtter `time_range` og `manual`.
- `time_entries.start_time` og `time_entries.end_time` kan være tomme.
- `time_entries.hours` er påkrevd og har maksgrense 24.

## Test Oppgave 2

1. Logg inn som ansatt.
2. Åpne en planlagt ordre og gå til timeføring.
3. Velg `Fra-til klokkeslett`, sett start og slutt, og kontroller at timer beregnes automatisk.
4. Prøv sluttid før starttid og sjekk at appen stopper lagring.
5. Velg `Manuelt antall timer` og sjekk at kun timefeltet vises.
6. Prøv 0, negativt tall og over 24 timer. Appen skal stoppe lagring.
7. Lagre en gyldig manuell føring.
8. Logg inn som admin og eksporter CSV. Kontroller at `metode` er med, og at manuelle føringer har tom start/slutt.

## Test Oppgave 3

1. Logg inn som admin.
2. Opprett en ordre uten ansatt og dato.
3. Gå til `Planlegging`.
4. Trykk `Planlegg` på ordren.
5. Velg ansatt, dato, starttid og estimert varighet.
6. Lagre planleggingen.
7. Kontroller at ordren forsvinner fra `Til planlegging`.
8. Kontroller at ordren vises i ukeplanen på valgt ansatt og dag.
9. Gå til `Kalender` og kontroller at ordren også vises der.

## Test Oppgave 4

1. Logg inn som admin.
2. Kontroller at menyen viser: `Dashboard`, `Ordre`, `Planlegging`, `Til fakturering`, `Arkiv`, `Timer/eksport`.
3. Kontroller at `Kalender` ikke vises som egen adminfane.
4. Logg inn som ansatt.
5. Kontroller at ansatt fortsatt har kalender for egne jobber.

## Test Oppgave 5

1. Åpne Supabase Table Editor.
2. Sjekk at `orders` har feltene `scheduled_start`, `scheduled_end`, `completed_at`, `completed_by`, `invoiced_at` og `invoiced_by`.
3. Sjekk at `time_entries` har `entry_method`, nullable `start_time`, nullable `end_time` og `hours`.
4. Sjekk at appen fortsatt kan opprette ordre, planlegge ordre, føre timer og eksportere CSV.
