# Låsia AS internapp

MVP for ordre, kalender, timeføring og CSV-eksport for Låsia AS.

## Oppsett

1. Kjør SQL i `supabase/schema.sql` i Supabase.
2. Legg miljøvariabler i Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ypaucjulcfutkwrlhyfs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=din_anon_key
```

3. Opprett første bruker i Supabase Auth og sett den til admin:

```sql
update public.profiles set role = 'admin' where email = 'din-admin@lasia.no';
```

## MVP

- Admin oppretter ordre og tildeler ansatt.
- Ansatt ser egne ordre i oversikt og kalender.
- Ansatt fører timer.
- Admin godkjenner timer og eksporterer CSV.
- Tripletex integreres senere via `orders.tripletex_id` og CSV/serverside API.
