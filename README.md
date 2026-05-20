# Lasia AS internapp

MVP for ordre, kalender, timeforing og CSV-eksport for Lasia AS.

Produksjon: https://lasia-internapp.vercel.app/

## Oppsett

1. Opprett Supabase-prosjekt.
2. Kjor `supabase/schema.sql` i SQL Editor for ny database.
3. For eksisterende database: kjor migrasjonene under `Migreringer` i denne README-en.
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

Ordrestatusene er:

1. `planning` - Til planlegging
2. `scheduled` - Planlagt
3. `in_progress` - Pagar
4. `completed_pending_invoice` - Ferdig - til fakturering
5. `invoiced_archived` - Fakturert / arkiv

Flyt:

- Admin oppretter ordre.
- Ordre uten dato/deltakere ligger under `Til planlegging`.
- Admin planlegger ordre med dato, tid og en eller flere deltakere.
- Ordren vises i kalenderen til alle deltakere.
- Hver deltaker kan fore egne timer og huke av `Min del er ferdig`.
- Ordren flyttes forst til `Ferdig - til fakturering` nar alle deltakere er ferdige.
- Admin kan overstyre ferdigstatus per deltaker.
- Admin kan markere ordre som fakturert.
- Fakturerte ordre ligger i `Arkiv` og vises ikke i aktiv kalender.

## Kalender

Kalenderen har:

- Knappene `Forrige uke`, `Denne uken` og `Neste uke`.
- Norsk ukevisning med mandag som forste ukedag.
- Norsk datoformat og norske ukedager.
- Standardvisning mandag-fredag.
- Valg mellom `Vis arbeidsuke` og `Vis hele uken`.
- Norske helligdager/fridager markert direkte i kalenderen.
- Klikk pa ordre apner detaljvisning.

Helligdager beregnes i appen med en enkel hjelpefunksjon, uten ekstern pakke.

## Ordredetaljer

Detaljvisningen viser:

- Ordrenummer
- Kunde
- Adresse
- Kontaktperson
- Telefon
- Beskrivelse
- Intern kommentar
- Status
- Planlagt start/slutt
- Tildelte deltakere
- Timeforinger
- Ferdigstatus per deltaker
- Fakturert/arkivstatus nar relevant

Samme detaljvisning brukes ogsa for ordre i arkiv.

## Timeforing

Ansatt kan velge metode per timeforing:

1. `time_range` - Fra-til klokkeslett. Starttid og sluttid lagres, og timer beregnes automatisk.
2. `manual` - Manuelt antall timer. Starttid og sluttid er tomme, kun timer lagres.

Validering:

- Sluttid ma vare etter starttid ved fra-til.
- Timer ma vare storre enn 0.
- Maks 24 timer per foring.
- Kommentar og arbeidstype er beholdt.

CSV-eksporten inneholder kolonnen `metode`, slik at man ser om foringen er gjort med klokkeslett eller manuelt.

## Adminmeny

Adminnavigasjonen viser:

- Dashboard
- Ordre
- Min kalender
- Planlegging
- Til fakturering
- Arkiv
- Timer

Admin regnes ogsa som ansatt og kan derfor ha egne ordre, egen kalender, egne timer og egen ferdigstatus.

## Sikkerhet

Supabase Auth og RLS brukes som sikkerhetslag.

- Admin ser alle ordre, deltakere og timeforinger.
- Deltakere ser ordre de er deltaker pa.
- Deltakere kan fore egne timer pa ordre de har tilgang til.
- Deltakere kan markere egen del ferdig.
- Kun admin kan fakturere/arkivere.
- Nye Auth-brukere opprettes alltid som `employee`.
- Ansatte kan ikke endre egen rolle til `admin`.

## Migreringer

### Flere deltakere og ferdigflyt

Denne migreringen er kjort i Supabase-prosjektet. Den bevarer gamle ordre ved a kopiere `assigned_employee_id` inn i `order_participants`.

```sql
create table if not exists public.order_participants (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, user_id)
);

create index if not exists order_participants_order_id_idx on public.order_participants(order_id);
create index if not exists order_participants_user_id_idx on public.order_participants(user_id);
create index if not exists order_participants_finished_at_idx on public.order_participants(finished_at);

insert into public.order_participants (order_id, user_id)
select id, assigned_employee_id
from public.orders
where assigned_employee_id is not null
on conflict (order_id, user_id) do nothing;

create or replace function public.is_order_participant(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.order_participants op
    where op.order_id = p_order_id
      and op.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_order(order_row public.orders)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or order_row.assigned_employee_id = auth.uid()
    or public.is_order_participant(order_row.id);
$$;

create or replace function public.enforce_order_flow_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if public.is_admin() then
    if new.status = 'invoiced_archived' and old.status is distinct from 'invoiced_archived' then
      new.invoiced_at = coalesce(new.invoiced_at, now());
      new.invoiced_by = coalesce(new.invoiced_by, auth.uid());
    end if;
    return new;
  end if;

  if public.can_access_order(old)
    and new.status = 'in_progress'
    and old.status = 'scheduled' then
    return new;
  end if;

  raise exception 'Ansatte kan bare starte egne planlagte ordre. Ferdigmelding gjores per deltaker.';
end;
$$;

create or replace function public.enforce_order_participant_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if old.user_id = auth.uid()
    and new.user_id = old.user_id
    and new.order_id = old.order_id
    and new.id = old.id
    and new.created_at = old.created_at then
    return new;
  end if;

  raise exception 'Deltakere kan bare endre egen ferdigstatus.';
end;
$$;

drop trigger if exists enforce_order_participant_update_trigger on public.order_participants;
create trigger enforce_order_participant_update_trigger
before update on public.order_participants
for each row execute function public.enforce_order_participant_update();

create or replace function public.complete_order_when_all_participants_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.finished_at is not null
    and exists (select 1 from public.order_participants where order_id = new.order_id)
    and not exists (select 1 from public.order_participants where order_id = new.order_id and finished_at is null) then
    update public.orders
    set status = 'completed_pending_invoice',
        completed_at = coalesce(completed_at, now()),
        completed_by = coalesce(completed_by, auth.uid())
    where id = new.order_id
      and status <> 'invoiced_archived';
  end if;

  return new;
end;
$$;

drop trigger if exists complete_order_when_all_participants_done_trigger on public.order_participants;
create trigger complete_order_when_all_participants_done_trigger
 after update of finished_at on public.order_participants
 for each row execute function public.complete_order_when_all_participants_done();

alter table public.order_participants enable row level security;

drop policy if exists "Order participants: admins see all, participants see order" on public.order_participants;
drop policy if exists "Order participants: admins manage" on public.order_participants;
drop policy if exists "Order participants: participants update own finish" on public.order_participants;

create policy "Order participants: admins see all, participants see order" on public.order_participants
for select using (
  public.is_admin()
  or user_id = auth.uid()
  or exists (select 1 from public.orders o where o.id = order_id and public.can_access_order(o))
);

create policy "Order participants: admins manage" on public.order_participants
for all using (public.is_admin()) with check (public.is_admin());

create policy "Order participants: participants update own finish" on public.order_participants
for update using (user_id = auth.uid()) with check (user_id = auth.uid());
```

## Endrede filer

- `app/page.tsx` - kalendernavigasjon, helligdager, ordredetaljer, flere deltakere, admin som ansatt, ferdigstatus per deltaker og menyendring fra `Timer/eksport` til `Timer`.
- `supabase/schema.sql` - oppdatert fullskjema med `order_participants`, triggere, funksjoner og RLS.
- `README.md` - oppdatert oppsett, migrering og teststeg.

## Verifisering

Vercel har bygget commit `f9c9cf1` med appendringene:

- `npm run build` ble kjort av Vercel.
- Next.js kompilerte uten feil.
- Type-/lint-sjekken i Next build passerte.
- Deployment ble fullfort.

`npm run lint` finnes ikke som eget script i GitHub-versjonen av `package.json`.

## Slik tester du

### Kalender

1. Logg inn som admin eller ansatt.
2. Apne `Min kalender` eller ansattens `Kalender`.
3. Trykk `Forrige uke`, `Denne uken` og `Neste uke`.
4. Kontroller at uken starter pa mandag.
5. Bytt mellom `Vis arbeidsuke` og `Vis hele uken`.
6. Kontroller at norske helligdager/fridager vises i kalenderen.
7. Trykk pa en ordre og kontroller at detaljvisningen apnes.

### Flere deltakere

1. Logg inn som admin.
2. Opprett eller rediger en ordre.
3. Velg flere deltakere i deltakerlisten.
4. Planlegg ordren med dato og tid.
5. Logg inn som hver deltaker og kontroller at ordren vises i kalenderen.
6. Kontroller at admin ogsa kan legges til som deltaker og se ordren i egen kalender.

### Ferdigflyt

1. Logg inn som forste deltaker.
2. For timer pa ordren og huk av `Min del er ferdig`.
3. Kontroller at ordren ikke gar til `Ferdig - til fakturering` hvis andre deltakere ikke er ferdige.
4. Logg inn som siste deltaker.
5. For timer og huk av `Min del er ferdig`.
6. Kontroller at ordren flyttes til `Til fakturering`.
7. Logg inn som admin og marker ordren som fakturert.
8. Apne `Arkiv`, finn ordren og apne detaljvisningen.

### Timer og CSV

1. For timer med `Fra-til klokkeslett` og kontroller at timer beregnes automatisk.
2. For timer med `Manuelt antall timer` og kontroller at start/slutt ikke kreves.
3. Logg inn som admin.
4. Apne `Timer` og eksporter CSV.
5. Kontroller at eksporten fortsatt inneholder timeforingene og kolonnen `metode`.
