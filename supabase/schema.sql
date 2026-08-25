create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  description text,
  duration_min int not null,
  price numeric(10,2) not null,
  active boolean default true,
  sort_order int default 0
);

create table therapists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nickname text,
  specialty text,
  active boolean default true
);

create table therapist_shifts (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid references therapists(id),
  work_date date not null,
  start_time time not null,
  end_time time not null
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text unique not null default upper(substr(md5(random()::text),1,6)),
  line_user_id text,
  customer_name text,
  customer_phone text,
  service_id uuid references services(id),
  therapist_id uuid not null references therapists(id),
  time_range tstzrange not null,
  status text not null default 'hold',
  source text default 'line',
  deposit_amount numeric(10,2) default 0,
  total_amount numeric(10,2) default 0,
  paid_amount numeric(10,2) default 0,
  payment_method text,
  hold_expires_at timestamptz,
  note text,
  created_at timestamptz default now(),
  constraint no_overlap exclude using gist (
    therapist_id with =,
    time_range with &&
  ) where (status in ('hold','pending_payment','confirmed','completed'))
);

create index on bookings (lower(time_range));
create index on bookings (status);

create table conversations (
  line_user_id text primary key,
  state jsonb default '{}'::jsonb,
  history jsonb default '[]'::jsonb,
  ai_paused_until timestamptz,
  updated_at timestamptz default now()
);

create table webhook_events (
  event_id text primary key,
  received_at timestamptz default now()
);

create table shop_info (
  key text primary key,
  value text not null
);

alter table bookings enable row level security;
grant select on table bookings to anon;
create policy "Demo bookings are readable for realtime"
on bookings for select to anon
using (true);

alter table bookings replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table bookings;
  end if;
end
$$;
