# Lasia AS internapp

MVP for ordre, kalender, timeforing, fakturaflyt, CSV-eksport, Outlook/ICS-feed og drag-and-drop-planlegging for Lasia AS.

Produksjon: https://lasia-internapp.vercel.app/

## Hovedflyt

Ordrestatuser:

1. `planning` - Til planlegging
2. `scheduled` - Planlagt
3. `in_progress` - Pagar
4. `completed_pending_invoice` - Ferdig - til fakturering
5. `invoiced_archived` - Fakturert / arkiv

Låsia er hovedsystemet. Outlook/telefonkalender er kun en skrivebeskyttet kalenderkopi via ICS-feed.

## Sider

- `/planlegging` - drag-and-drop planlegging for admin.
- `/outlook` - koble egen kalenderfeed til Outlook, iPhone Kalender eller Google Kalender.
- `/api/calendar/[token].ics` - ICS-feed per ansatt.

## Flere kalenderokter per ordre

Kalenderen bruker nå `order_schedule_entries` som planlagt kalenderflate. Én ordre kan ligge i kalenderen flere ganger, også på ikke-sammenhengende dager.

- `order_participants` beholdes som deltakerliste på ordren.
- Timeføring knyttes fortsatt til ordre, ikke til enkeltøkt.
- `orders.scheduled_start` og `orders.scheduled_end` beholdes midlertidig for bakoverkompatibilitet.
- Eksisterende ordre med `scheduled_start` og `scheduled_end` er migrert til én kalenderøkt.

## Planlegging

Admin kan åpne `/planlegging`.

- Venstre side har filter: `Til planlegging`, `Påbegynte`, `Alle aktive`.
- Ordre med status `planning` kan dras inn i kalenderen.
- Ordre med status `in_progress` kan dras inn igjen for ny økt.
- `completed_pending_invoice` og `invoiced_archived` kan ikke planlegges videre.
- Ved første planlegging av `planning` settes status til `scheduled`.
- Ved ny økt på en `in_progress` ordre beholdes status `in_progress`.
- Planlagte kalenderøkter kan flyttes ved å dra dem til ny dato/tid.
- Én enkelt kalenderøkt kan slettes uten å slette ordren.

## ICS / Outlook

Hver bruker har `profiles.calendar_token`. Kalender-URL-en inneholder token og er derfor ikke en åpen liste uten hemmelig lenke.

Feeden viser alle kalenderøkter for ordre der brukeren er deltaker og ordren har status:

- `scheduled`
- `in_progress`
- `completed_pending_invoice`

Hvis samme ordre ligger mandag, onsdag og fredag, får Outlook tre kalenderhendelser. Hver hendelse har unik UID basert på `order_schedule_entries.id`.

Feeden viser ikke:

- `planning`
- `invoiced_archived`
- ordre uten kalenderøkt

## SQL / migrering

Denne er kjørt i Supabase-prosjektet og ligger også i `supabase/migrations/add_order_schedule_entries.sql`.

```sql
create table if not exists public.order_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_schedule_entries_time_check check (end_time > start_time)
);

create index if not exists order_schedule_entries_order_id_idx on public.order_schedule_entries(order_id);
create index if not exists order_schedule_entries_start_time_idx on public.order_schedule_entries(start_time);
create index if not exists order_schedule_entries_end_time_idx on public.order_schedule_entries(end_time);

insert into public.order_schedule_entries (order_id, start_time, end_time, created_by)
select o.id, o.scheduled_start, o.scheduled_end, o.created_by
from public.orders o
where o.scheduled_start is not null
  and o.scheduled_end is not null
  and not exists (
    select 1
    from public.order_schedule_entries ose
    where ose.order_id = o.id
      and ose.start_time = o.scheduled_start
      and ose.end_time = o.scheduled_end
  );
```

Full SQL med RLS og ICS-RPC ligger i migrasjonsfilen.

## Endrede filer

- `app/planlegging/page.tsx` - flere kalenderøkter, filtre, flytt/slett enkeltøkt.
- `app/api/calendar/[token]/route.ts` - ICS bruker nå schedule entry UID per hendelse.
- `supabase/migrations/add_order_schedule_entries.sql` - tabell, backfill, RLS og ICS-RPC.
- `README.md` - oppdatert flyt og teststeg.

## Testing

### Mandag, onsdag og fredag

1. Logg inn som admin.
2. Åpne `https://lasia-internapp.vercel.app/planlegging`.
3. Finn en ordre under `Til planlegging`.
4. Dra ordren til mandag kl. 08 og lagre.
5. Bytt filter til `Alle aktive`.
6. Dra samme ordre til onsdag kl. 08 og lagre som ny økt.
7. Dra samme ordre til fredag kl. 08 og lagre som ny økt.
8. Klikk ordren og kontroller at detaljvisningen viser tre kalenderøkter.

### Pågår-ordre tilbake i kalender

1. Sett en ordre til `Pågår`.
2. Åpne `/planlegging`.
3. Velg filter `Påbegynte`.
4. Dra ordren inn på en ny dato/tid.
5. Lagre.
6. Kontroller at ordren fortsatt har status `Pågår`.

### Flytte eller slette én økt

1. Klikk på en ordre i kalenderen.
2. Finn ønsket kalenderøkt i detaljvisningen.
3. Trykk `Flytt/endre` for å endre tidspunkt, eller `Slett økt` for å fjerne kun den økten.
4. Kontroller at resten av ordren og andre økter ligger igjen.

### Outlook / ICS

1. Åpne `/outlook` og kopier ICS-URL.
2. Åpne URL-en i nettleser/notisblokk.
3. Kontroller at en ordre med tre økter gir tre `BEGIN:VEVENT`.
4. Kontroller at hver hendelse har forskjellig `UID`.
5. Flytt én økt i `/planlegging`.
6. Last ICS-URL-en på nytt og kontroller at riktig hendelse har nytt tidspunkt.

Outlook bestemmer selv hvor ofte abonnementskalendere synkroniseres. Låsia-feeden oppdateres med en gang, men Outlook kan bruke tid.
