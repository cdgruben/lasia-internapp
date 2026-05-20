create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'employee');
create type public.order_status as enum ('planning', 'scheduled', 'in_progress', 'completed_pending_invoice', 'invoiced_archived');
create type public.work_type as enum ('ordinaer', 'reise', 'overtid', 'materiellhenting', 'dokumentasjon');
create type public.time_entry_method as enum ('time_range', 'manual');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.user_role not null default 'employee',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  address text not null,
  contact_person text,
  phone text,
  description text not null,
  assigned_employee_id uuid references public.profiles(id) on delete set null,
  order_date date,
  estimated_hours numeric(6,2),
  status public.order_status not null default 'planning',
  internal_comment text,
  tripletex_id text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  invoiced_at timestamptz,
  invoiced_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null,
  entry_method public.time_entry_method not null default 'time_range',
  start_time time,
  end_time time,
  hours numeric(6,2) not null check (hours > 0 and hours <= 24),
  comment text,
  work_type public.work_type not null default 'ordinaer',
  approved boolean not null default false,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_method_time_check check (
    (entry_method = 'time_range' and start_time is not null and end_time is not null and end_time > start_time)
    or
    (entry_method = 'manual')
  )
);

create index orders_assigned_employee_id_idx on public.orders(assigned_employee_id);
create index orders_order_date_idx on public.orders(order_date);
create index orders_status_idx on public.orders(status);
create index orders_scheduled_start_idx on public.orders(scheduled_start);
create index orders_scheduled_end_idx on public.orders(scheduled_end);
create index time_entries_employee_id_idx on public.time_entries(employee_id);
create index time_entries_order_id_idx on public.time_entries(order_id);
create index time_entries_entry_date_idx on public.time_entries(entry_date);
create index time_entries_approved_idx on public.time_entries(approved);
create index time_entries_entry_method_idx on public.time_entries(entry_method);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger orders_touch_updated_at before update on public.orders for each row execute function public.touch_updated_at();
create trigger time_entries_touch_updated_at before update on public.time_entries for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email, coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'employee'), new.raw_user_meta_data->>'phone')
  on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, role = excluded.role, phone = excluded.phone;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;
create or replace function public.can_access_order(order_row public.orders) returns boolean language sql stable security definer set search_path = public as $$ select public.is_admin() or order_row.assigned_employee_id = auth.uid(); $$;

create or replace function public.enforce_order_flow_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    if new.status = 'invoiced_archived' and old.status is distinct from 'invoiced_archived' then
      new.invoiced_at = coalesce(new.invoiced_at, now());
      new.invoiced_by = coalesce(new.invoiced_by, auth.uid());
    end if;
    return new;
  end if;

  if old.assigned_employee_id = auth.uid() and new.status = 'in_progress' and old.status = 'scheduled' then
    return new;
  end if;

  if old.assigned_employee_id = auth.uid() and new.status = 'completed_pending_invoice' and old.status in ('scheduled', 'in_progress', 'completed_pending_invoice') then
    new.completed_at = coalesce(new.completed_at, now());
    new.completed_by = coalesce(new.completed_by, auth.uid());
    return new;
  end if;

  raise exception 'Ansatte kan bare starte eller ferdigmelde egne planlagte ordre.';
end;
$$;
create trigger enforce_order_flow_update_trigger before update on public.orders for each row execute function public.enforce_order_flow_update();

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.time_entries enable row level security;

create policy "Profiles: users see themselves, admins see all" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "Profiles: admins create employees" on public.profiles for insert with check (public.is_admin());
create policy "Profiles: users update own profile, admins update all" on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "Orders: admins see all, employees see assigned" on public.orders for select using (public.can_access_order(orders));
create policy "Orders: admins create" on public.orders for insert with check (public.is_admin());
create policy "Orders: admins update all, employees update assigned" on public.orders for update using (public.can_access_order(orders)) with check (public.can_access_order(orders));
create policy "Orders: admins delete" on public.orders for delete using (public.is_admin());
create policy "Time entries: admins see all, employees see own" on public.time_entries for select using (public.is_admin() or employee_id = auth.uid());
create policy "Time entries: employees create own entries on accessible orders" on public.time_entries for insert with check (employee_id = auth.uid() and exists (select 1 from public.orders o where o.id = order_id and public.can_access_order(o)));
create policy "Time entries: employees edit unapproved own entries, admins edit all" on public.time_entries for update using (public.is_admin() or (employee_id = auth.uid() and approved = false)) with check (public.is_admin() or (employee_id = auth.uid() and approved = false));
create policy "Time entries: admins delete" on public.time_entries for delete using (public.is_admin());

create or replace view public.tripletex_time_export as select te.entry_date, p.full_name as employee_name, p.email as employee_email, o.order_number, o.customer_name, o.tripletex_id, te.start_time, te.end_time, te.hours, te.work_type, te.comment, te.approved, te.entry_method from public.time_entries te join public.profiles p on p.id = te.employee_id join public.orders o on o.id = te.order_id;
comment on column public.orders.tripletex_id is 'Reserved for future Tripletex order/project/customer mapping.';
