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

drop trigger if exists order_schedule_entries_touch_updated_at on public.order_schedule_entries;
create trigger order_schedule_entries_touch_updated_at
before update on public.order_schedule_entries
for each row execute function public.touch_updated_at();

alter table public.order_schedule_entries enable row level security;

drop policy if exists "Schedule entries: admins see all, participants see own orders" on public.order_schedule_entries;
drop policy if exists "Schedule entries: admins manage" on public.order_schedule_entries;

create policy "Schedule entries: admins see all, participants see own orders" on public.order_schedule_entries
for select using (
  public.is_admin()
  or exists (
    select 1
    from public.orders o
    where o.id = order_id
      and public.can_access_order(o)
  )
);

create policy "Schedule entries: admins manage" on public.order_schedule_entries
for all using (public.is_admin()) with check (public.is_admin());

drop function if exists public.get_calendar_feed_orders(text);

create or replace function public.get_calendar_feed_orders(feed_token text)
returns table (
  schedule_entry_id uuid,
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
    ose.id as schedule_entry_id,
    o.id,
    o.order_number,
    o.customer_name,
    o.address,
    o.description,
    o.status,
    ose.start_time as scheduled_start,
    ose.end_time as scheduled_end,
    greatest(o.updated_at, ose.updated_at) as updated_at
  from public.profiles p
  join public.order_participants op on op.user_id = p.id
  join public.orders o on o.id = op.order_id
  join public.order_schedule_entries ose on ose.order_id = o.id
  where p.calendar_token = feed_token
    and p.calendar_token is not null
    and o.status in ('scheduled', 'in_progress', 'completed_pending_invoice')
  order by ose.start_time;
$$;
