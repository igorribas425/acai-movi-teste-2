create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  customer_phone text not null,
  delivery_mode text not null check (delivery_mode in ('delivery','pickup')),
  neighborhood text,
  street text,
  street_number text,
  address_complement text,
  reference text,
  payment text not null check (payment in ('pix','card','cash')),
  change_for text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  total numeric(10,2) not null default 0 check (total >= 0),
  notes text,
  status text not null default 'new' check (status in ('new','confirmed','preparing','out_for_delivery','delivered','cancelled')),
  source text not null default 'site',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_created_at_idx on public.orders (status, created_at desc);

drop policy if exists "public create orders" on public.orders;
create policy "public create orders"
on public.orders for insert to anon, authenticated
with check (
  status = 'new'
  and delivery_mode in ('delivery','pickup')
  and payment in ('pix','card','cash')
  and char_length(customer_name) between 2 and 100
  and char_length(customer_phone) between 8 and 30
  and jsonb_typeof(items) = 'array'
  and jsonb_array_length(items) > 0
  and total >= 0
);

drop policy if exists "admin read orders" on public.orders;
create policy "admin read orders"
on public.orders for select to authenticated
using (private.is_acai_admin());

drop policy if exists "admin update orders" on public.orders;
create policy "admin update orders"
on public.orders for update to authenticated
using (private.is_acai_admin())
with check (private.is_acai_admin());

drop policy if exists "admin delete orders" on public.orders;
create policy "admin delete orders"
on public.orders for delete to authenticated
using (private.is_acai_admin());
