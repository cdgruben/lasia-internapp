# Lasia AS internapp

MVP for ordre, kalender, timeforing, fakturaflyt, CSV-eksport, Outlook/ICS-feed og drag-and-drop-planlegging for Lasia AS.

Produksjon: https://lasia-internapp.vercel.app/

## Oppsett

1. Opprett Supabase-prosjekt.
2. Kjor `supabase/schema.sql` i SQL Editor for ny database.
3. For eksisterende database: kjor relevante SQL-filer i `supabase/migrations/`.
4. Legg miljovariabler i Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ypaucjulcfutkwrlhyfs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=din_anon_key
```

5. Opprett forste bruker i Supabase Auth og sett den til admin:

```sql
update public.profiles set role = 'admin' where email = 'din-admin@lasia.no';
```

## Hovedflyt

Ordrestatuser:

1. `planning` - Til planlegging
2. `scheduled` - Planlagt
3. `in_progress` - Pagar
4. `completed_pending_invoice` - Ferdig - til fakturering
5. `invoiced_archived` - Fakturert / arkiv

Låsia er hovedsystemet. Outlook/telefonkalender er kun en skrivebeskyttet kalenderkopi via ICS-feed.

## Nye sider

- `/planlegging` - drag-and-drop planlegging for admin.
- `/outlook` - koble egen kalenderfeed til Outlook, iPhone Kalender eller Google Kalender.
- `/api/calendar/[token].ics` - ICS-feed per ansatt.

## ICS / Outlook

Hver bruker har `profiles.calendar_token`. Kalender-URL-en inneholder token og er derfor ikke en åpen liste uten hemmelig lenke.

Feeden viser bare ordre der brukeren er deltaker og ordren har:

- `scheduled`
- `in_progress`
- `completed_pending_invoice`

Feeden viser ikke:

- `planning`
- `invoiced_archived`
- ordre uten `scheduled_start`/`scheduled_end`

ICS-event inneholder ordrenummer, kunde, adresse, beskrivelse, start/slutt, status og lenke tilbake til ordredetaljer i appen når mulig.

## Drag-and-drop planlegging

Admin kan åpne `/planlegging`.

- Venstre side viser ordre med status `planning`.
- Høyre side viser ukeplan per ansatt.
- Kalenderen har norsk uke, mandag først, helligdager og valg mellom arbeidsuke/hele uken.
- Dra en ordre inn på et klokkeslett hos en ansatt.
- Modal åpnes for å bekrefte deltakere, dato, starttid og varighet.
- Etter lagring settes `status = scheduled`, `scheduled_start`, `scheduled_end` og `order_participants`.
- Planlagte ordre kan også dras til ny dato/tid.
- Deltakere beholdes når en planlagt ordre flyttes.

## Database-migrering for ICS

Denne er kjørt i Supabase-prosjektet og ligger også i `supabase/migrations/add_calendar_feed.sql`.

```sql
alter table public.profiles add column if not exists calendar_token text;

update public.profiles
set calendar_token = encode(gen_random_bytes(24), 'hex')
where calendar_token is null;

alter table public.profiles alter column calendar_token set default encode(gen_random_bytes(24), 'hex');

create unique index if not exists profiles_calendar_token_key on public.profiles(calendar_token);

create or replace function public.regenerate_calendar_token(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token text;
begin
  if not public.is_admin() then
    raise exception 'Kun admin kan regenerere kalender-token.';
  end if;

  new_token := encode(gen_random_bytes(24), 'hex');

  update public.profiles
  set calendar_token = new_token
  where id = target_user_id;

  if not found then
    raise exception 'Fant ikke bruker.';
  end if;

  return new_token;
end;
$$;

create or replace function public.get_calendar_feed_orders(feed_token text)
returns table (
  id uuid,
  order_number text,
  customer_name text,
  address text,
  description text,
  status public.order_status,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.order_number,
    o.customer_name,
    o.address,
    o.description,
    o.status,
    o.scheduled_start,
    o.scheduled_end,
    o.updated_at
  from public.profiles p
  join public.order_participants op on op.user_id = p.id
  join public.orders o on o.id = op.order_id
  where p.calendar_token = feed_token
    and p.calendar_token is not null
    and o.scheduled_start is not null
    and o.scheduled_end is not null
    and o.status in ('scheduled', 'in_progress', 'completed_pending_invoice')
  order by o.scheduled_start;
$$;
```

## Endrede filer

- `app/api/calendar/[token]/route.ts` - genererer `.ics` feed.
- `app/outlook/page.tsx` - side for kalender-URL, veiledning og token-regenerering.
- `app/planlegging/page.tsx` - drag-and-drop planlegging.
- `supabase/migrations/add_calendar_feed.sql` - SQL for token og ICS-RPC.
- `README.md` - oppdatert dokumentasjon og teststeg.

## Testing

### Drag-and-drop

1. Logg inn som admin.
2. Åpne `https://lasia-internapp.vercel.app/planlegging`.
3. Dra en ordre fra `Til planlegging` til en ansatt og et klokkeslett.
4. I modal: velg/juster deltakere, starttid og varighet.
5. Lagre.
6. Kontroller at ordren forsvinner fra `Til planlegging` og vises i kalenderen.
7. Dra en planlagt ordre til et nytt klokkeslett og lagre.
8. Kontroller at deltakerne er beholdt.

### Riktig ansatt

1. Planlegg ordre med to deltakere.
2. Logg inn som deltaker A og kontroller at ordren vises i egen kalender.
3. Logg inn som deltaker B og kontroller det samme.
4. Logg inn som en ikke-deltaker og kontroller at ordren ikke vises der.

### ICS-feed

1. Logg inn som ansatt eller admin.
2. Åpne `https://lasia-internapp.vercel.app/outlook`.
3. Kopier ICS-URL-en.
4. Åpne URL-en i nettleser. Den skal returnere `BEGIN:VCALENDAR`.
5. Planlegg eller flytt en ordre i Låsia.
6. Last ICS-URL-en på nytt og kontroller at tidspunktet er oppdatert.
7. Marker ordren fakturert/arkivert og kontroller at den ikke lenger er i feeden.

### Legge feed i Outlook

1. Åpne Outlook Kalender.
2. Velg `Legg til kalender`.
3. Velg `Fra Internett` eller `Abonner fra web`.
4. Lim inn ICS-URL-en fra Låsia.
5. Lagre som abonnementskalender.

Outlook kan bruke litt tid på å hente oppdateringer. Låsia oppdaterer feeden med en gang, men Outlook bestemmer selv hvor ofte abonnementet synkroniseres.

## Verifisering

Vercel kjører `npm run build` ved deploy. Det finnes ikke eget `npm run lint`-script i GitHub-versjonen av prosjektet.
