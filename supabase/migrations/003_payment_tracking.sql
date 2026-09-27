alter table public.orders
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending','pay_on_delivery','paid','cancelled','refunded')),
  add column if not exists tracking_token uuid not null default gen_random_uuid(),
  add column if not exists confirmed_at timestamptz,
  add column if not exists preparing_at timestamptz,
  add column if not exists out_for_delivery_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_confirmed_by_customer boolean not null default false;

create unique index if not exists orders_tracking_token_idx on public.orders(tracking_token);

create or replace function private.set_order_payment_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment = 'pix' then
    new.payment_status := 'pending';
  else
    new.payment_status := 'pay_on_delivery';
  end if;
  return new;
end;
$$;

drop trigger if exists set_order_payment_defaults on public.orders;
create trigger set_order_payment_defaults
before insert on public.orders
for each row execute function private.set_order_payment_defaults();

revoke all on function private.set_order_payment_defaults() from public, anon, authenticated;

create or replace function public.get_order_tracking(p_token uuid)
returns table (
  order_number text,
  status text,
  payment text,
  payment_status text,
  customer_name text,
  delivery_mode text,
  neighborhood text,
  total numeric,
  created_at timestamptz,
  confirmed_at timestamptz,
  preparing_at timestamptz,
  out_for_delivery_at timestamptz,
  delivered_at timestamptz,
  delivered_confirmed_by_customer boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.order_number,o.status,o.payment,o.payment_status,o.customer_name,
    o.delivery_mode,o.neighborhood,o.total,o.created_at,o.confirmed_at,
    o.preparing_at,o.out_for_delivery_at,o.delivered_at,
    o.delivered_confirmed_by_customer
  from public.orders o
  where o.tracking_token = p_token
  limit 1;
$$;

revoke all on function public.get_order_tracking(uuid) from public;
grant execute on function public.get_order_tracking(uuid) to anon, authenticated;

create or replace function public.confirm_order_delivery(p_token uuid)
returns table (
  order_number text,
  status text,
  payment_status text,
  delivered_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.orders o
  set
    status = 'delivered',
    payment_status = case when o.payment in ('cash','card') then 'paid' else o.payment_status end,
    delivered_at = now(),
    delivered_confirmed_by_customer = true,
    updated_at = now(),
    status_updated_at = now()
  where o.tracking_token = p_token
    and o.status = 'out_for_delivery'
  returning o.order_number,o.status,o.payment_status,o.delivered_at;
end;
$$;

revoke all on function public.confirm_order_delivery(uuid) from public;
grant execute on function public.confirm_order_delivery(uuid) to anon, authenticated;
