create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  description text not null default '',
  price numeric(10,2) not null default 0,
  image_url text not null default '',
  free_limit integer not null default 4,
  category text not null default 'cups',
  active boolean not null default true,
  featured boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.complements (
  id text primary key,
  name text not null,
  price numeric(10,2) not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_zones (
  id text primary key,
  name text not null,
  fee numeric(10,2) not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.store_settings enable row level security;
alter table public.products enable row level security;
alter table public.complements enable row level security;
alter table public.delivery_zones enable row level security;

create or replace function public.is_acai_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid());
$$;

create policy "public read store" on public.store_settings for select using (true);
create policy "public read products" on public.products for select using (true);
create policy "public read complements" on public.complements for select using (true);
create policy "public read zones" on public.delivery_zones for select using (true);
create policy "admin read self" on public.admin_users for select using (user_id = auth.uid());
create policy "admin write store" on public.store_settings for all using (public.is_acai_admin()) with check (public.is_acai_admin());
create policy "admin write products" on public.products for all using (public.is_acai_admin()) with check (public.is_acai_admin());
create policy "admin write complements" on public.complements for all using (public.is_acai_admin()) with check (public.is_acai_admin());
create policy "admin write zones" on public.delivery_zones for all using (public.is_acai_admin()) with check (public.is_acai_admin());

insert into storage.buckets (id,name,public)
values ('product-images','product-images',true)
on conflict (id) do update set public=true;

create policy "public product images" on storage.objects for select using (bucket_id='product-images');
create policy "admin upload product images" on storage.objects for insert with check (bucket_id='product-images' and public.is_acai_admin());
create policy "admin update product images" on storage.objects for update using (bucket_id='product-images' and public.is_acai_admin()) with check (bucket_id='product-images' and public.is_acai_admin());
create policy "admin delete product images" on storage.objects for delete using (bucket_id='product-images' and public.is_acai_admin());

insert into public.store_settings(id,data) values (
  'main',
  jsonb_build_object(
    'store_name','Açaí Moví',
    'city','Francisco Beltrão',
    'state','PR',
    'instagram_url','https://www.instagram.com/acaimovi?stkn=MW56b3NqeTcxZTQ5Zw==',
    'whatsapp_url','https://wa.me/message/KONPQZAX7CH2L1',
    'opens_at','13:00',
    'closes_at','22:00'
  )
) on conflict (id) do nothing;

insert into public.products(id,name,description,price,image_url,free_limit,category,active,featured,sort_order) values
('acai-300','Açaí 300ml','O tamanho perfeito para começar 💜',18,'images/produto-300.png',4,'cups',true,false,1),
('acai-400','Açaí 400ml','O equilíbrio perfeito.',20,'images/produto-400.png',4,'cups',true,true,2),
('acai-500','Açaí 500ml','Nosso campeão de pedidos.',22,'images/produto-500.png',4,'cups',true,false,3),
('acai-1kg','Marmita 1kg','Ideal para compartilhar.',45,'images/produto-1kg.jpg',6,'marmita',true,false,4)
on conflict (id) do nothing;

insert into public.complements(id,name,price,active,sort_order) values
('banana','Banana',0,true,1),
('granola','Granola',0,true,2),
('amendoim','Amendoim',0,true,3),
('pacoca','Paçoca',0,true,4),
('leite-po','Leite em pó',0,true,5),
('confete','Confete',0,true,6),
('coco','Coco ralado',0,true,7),
('leite-condensado','Leite condensado',0,true,8),
('bis','Bis',0,true,9),
('morango','Morango',3,true,10),
('kiwi','Kiwi',3,true,11),
('creme-avela','Creme de avelã',3,true,12),
('oreo','Oreo (bolacha)',3,true,13)
on conflict (id) do nothing;

insert into public.delivery_zones(id,name,fee,active) values
('aeroporto','Aeroporto',13,true),
('agua-branca','Água Branca',14,true),
('agua-branca-m','Água Branca M',15,true),
('alto-da-julio','Alto da Julio',12,true),
('alvorada','Alvorada',10,true),
('bom-pastor','Bom Pastor',13,true),
('cango','Cango',10,true),
('cantelmo','Cantelmo',14,true),
('centro','Centro',10,true),
('centro-m','Centro M',30,true),
('cristo-rei','Cristo Rei',10,true),
('guanabara','Guanabara',11,true),
('industrial','Industrial',12,true),
('ipiranga-m','Ipiranga M',30,true),
('jardim-floresta','Jardim Floresta',14,true),
('jardim-italia','Jardim Itália',12,true),
('primavera','Primavera',14,true),
('seminario','Seminário',13,true),
('virginia','Virgínia',12,true),
('jupiter','Júpiter',14,true),
('kennedy','Kennedy',10,true),
('marmeleiro','Marmeleiro',30,true),
('marrecas','Marrecas',12,true),
('miniguacu','Miniguaçu',14,true),
('monte-rey','Monte Rey',12,true),
('nortao','Nortão',20,true),
('nossa-senhora','Nossa Senhora',10,true),
('nova-petropolis','Nova Petrópolis',12,true),
('novo-horizonte','Novo Horizonte',12,true),
('novo-mundo','Novo Mundo',12,true),
('padre-ulrico','Padre Ulrico',14,true),
('passarela-m','Passarela M',30,true),
('pedra-branca-m','Pedra Branca M',18,true),
('pinheirao','Pinheirão',15,true),
('pinheirinho','Pinheirinho',14,true),
('raffer','Raffer',13,true),
('sadia','Sadia',15,true),
('santa-barbara','Santa Bárbara',20,true),
('sao-cristovao','São Cristóvão',12,true),
('sao-francisco','São Francisco',11,true),
('sao-marcos','São Marcos',18,true),
('sao-miguel','São Miguel',12,true),
('terra-nossa','Terra Nossa',15,true),
('vila-nova','Vila Nova',12,true)
on conflict (id) do nothing;
