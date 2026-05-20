alter table public.profiles add column if not exists calendar_token text;

update public.profiles
set calendar_token = encode(extensions.gen_random_bytes(24), 'hex')
where calendar_token is null;

alter table public.profiles alter column calendar_token set default encode(extensions.gen_random_bytes(24), 'hex');

create unique index if not exists profiles_calendar_token_key on public.profiles(calendar_token);

create or replace function public.regenerate_calendar_token(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_token text;
begin
  if not public.is_admin() then
    raise exception 'Kun admin kan regenerere kalender-token.';
  end if;

  new_token := encode(extensions.gen_random_bytes(24), 'hex');

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
