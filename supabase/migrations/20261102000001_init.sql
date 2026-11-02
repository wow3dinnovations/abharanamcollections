-- Abharanam Collections: online catalog for 1 gram gold jewellery.
--
-- Where the data comes from:
--   * Categories, products, prices, stock and photos are PUBLISHED from the shop software
--     (apps/shop-admin, runs on the shop computer) using the service-role key.
--   * The website admin only controls what the shop software does not know about:
--     show/hide on the website, "featured", MRP (strike-through price), extra web description.
--   * Customers browse and send enquiries (no online payment). Wishlists live on the device.
--
-- Never stored here: purchase cost, vendors, locations, sales, expenses. Those stay on the shop computer.
-- Security is enforced with Row Level Security, not only in the UI.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'customer');

create type public.enquiry_status as enum ('new', 'contacted', 'confirmed', 'completed', 'cancelled');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- "Gold Jhumka 22" -> "gold-jhumka-22"
create or replace function public.slugify(txt text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(txt, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  city        text,
  role        public.user_role not null default 'customer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.phone);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only an admin (or the database owner / service role) can change a role.
create or replace function public.guard_profile_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'only an admin can change roles';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- Store settings (one row)
-- ---------------------------------------------------------------------------
create table public.store_settings (
  id                 int primary key default 1 check (id = 1),
  store_name         text not null default 'Abharanam Collections',
  tagline            text not null default 'Timeless Beauty, Precious You',
  whatsapp_number    text not null default '',          -- digits with country code, e.g. 919876543210
  phone              text not null default '',
  email              text not null default '',
  address            text not null default '',
  instagram_url      text not null default '',
  announcement       text not null default '',          -- thin bar at the top of the site and app
  show_prices        boolean not null default true,
  show_stock_count   boolean not null default false,    -- false: only "In stock" / "Sold out"
  enquiries_open     boolean not null default true,
  last_sync_at       timestamptz,                       -- written by the shop software
  updated_at         timestamptz not null default now()
);
insert into public.store_settings (id) values (1);

create trigger store_settings_updated_at before update on public.store_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  local_id     text unique,                 -- id in the shop software, e.g. CAT-0001
  name         text not null,
  slug         text not null unique,
  code         text,
  description  text not null default '',
  image_path   text,                        -- in the "catalog" bucket
  sort_order   int not null default 100,
  is_active    boolean not null default true,  -- from the shop software
  is_visible   boolean not null default true,  -- website admin switch
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.subcategories (
  id           uuid primary key default gen_random_uuid(),
  local_id     text unique,
  category_id  uuid not null references public.categories (id) on delete cascade,
  name         text not null,
  slug         text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (category_id, slug)
);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  local_id         text unique,             -- PRD-000001 in the shop software
  sku              text not null unique,
  name             text not null,
  slug             text not null unique,
  category_id      uuid references public.categories (id) on delete set null,
  subcategory_id   uuid references public.subcategories (id) on delete set null,
  description      text not null default '',  -- from the shop software
  web_description  text not null default '',  -- extra text written in the website admin
  price            numeric(10, 2) not null check (price >= 0),
  mrp              numeric(10, 2) check (mrp is null or mrp >= 0),  -- optional strike-through price
  collection       text not null default '',  -- Bridal, Temple, Daily wear ...
  material         text not null default '',
  colour           text not null default '',
  size             text not null default '',
  design_number    text not null default '',
  tags             text[] not null default '{}',
  stock_qty        int not null default 0 check (stock_qty >= 0),
  image_paths      text[] not null default '{}',   -- photos from the shop software ("catalog" bucket)
  extra_image_paths text[] not null default '{}',  -- more photos added in the website admin
  is_active        boolean not null default true,  -- from the shop software (inactive/deleted = false)
  is_visible       boolean not null default true,  -- website admin switch
  is_featured      boolean not null default false, -- shown on the home page
  added_at         timestamptz not null default now(),  -- date added in the shop
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  search           tsvector                         -- kept up to date by products_search trigger
);

-- Search text: name, SKU, collection, material, colour, design number, description and tags.
create or replace function public.products_search_update()
returns trigger language plpgsql as $$
begin
  new.search := to_tsvector('simple',
    coalesce(new.name, '') || ' ' || coalesce(new.sku, '') || ' ' || coalesce(new.collection, '') || ' ' ||
    coalesce(new.material, '') || ' ' || coalesce(new.colour, '') || ' ' || coalesce(new.design_number, '') || ' ' ||
    coalesce(new.description, '') || ' ' || coalesce(new.web_description, '') || ' ' || array_to_string(new.tags, ' '));
  return new;
end;
$$;

create trigger products_search before insert or update on public.products
  for each row execute function public.products_search_update();

create index products_category_idx on public.products (category_id);
create index products_search_idx on public.products using gin (search);
create index products_added_idx on public.products (added_at desc);
create index products_price_idx on public.products (price);

-- Fill slugs automatically (the shop software never sends one). Slugs never change once set,
-- so shared links keep working when a product is renamed.
create or replace function public.fill_slug()
returns trigger language plpgsql as $$
declare
  base text;
  candidate text;
  n int := 1;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;
  base := public.slugify(new.name);
  if tg_table_name = 'products' then
    base := public.slugify(new.name || '-' || new.sku);
  end if;
  if base = '' then base := 'item'; end if;
  candidate := base;
  loop
    if tg_table_name = 'products' then
      exit when not exists (select 1 from public.products where slug = candidate);
    elsif tg_table_name = 'categories' then
      exit when not exists (select 1 from public.categories where slug = candidate);
    else
      exit when not exists (select 1 from public.subcategories where slug = candidate and category_id = new.category_id);
    end if;
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

create trigger categories_slug before insert on public.categories for each row execute function public.fill_slug();
create trigger subcategories_slug before insert on public.subcategories for each row execute function public.fill_slug();
create trigger products_slug before insert on public.products for each row execute function public.fill_slug();

create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger subcategories_updated_at before update on public.subcategories for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();

-- What customers see: switched on in the shop, not hidden on the website, and its category is shown.
create or replace view public.catalog
with (security_invoker = true) as
select
  p.id, p.sku, p.name, p.slug, p.category_id, p.subcategory_id,
  c.name as category_name, c.slug as category_slug,
  s.name as subcategory_name, s.slug as subcategory_slug,
  trim(both e'\n' from concat_ws(e'\n\n', nullif(p.description, ''), nullif(p.web_description, ''))) as description,
  p.price, p.mrp, p.collection, p.material, p.colour, p.size, p.design_number, p.tags,
  p.stock_qty > 0 as in_stock,
  p.stock_qty,
  p.image_paths || p.extra_image_paths as image_paths, p.is_featured, p.added_at, p.search
from public.products p
left join public.categories c on c.id = p.category_id
left join public.subcategories s on s.id = p.subcategory_id
where p.is_active and p.is_visible
  and (c.id is null or (c.is_active and c.is_visible));

-- Categories with how many visible products each has (for the menu and home page).
create or replace view public.category_summary
with (security_invoker = true) as
select c.id, c.name, c.slug, c.description, c.image_path, c.sort_order,
       count(cat.id)::int as product_count,
       (array_agg(cat.image_paths[1] order by cat.is_featured desc, cat.added_at desc)
          filter (where cardinality(cat.image_paths) > 0))[1] as cover_path
from public.categories c
left join public.catalog cat on cat.category_id = c.id
where c.is_active and c.is_visible
group by c.id;

-- ---------------------------------------------------------------------------
-- Enquiries (instead of online payment: customer picks pieces, shop calls / WhatsApps back)
-- ---------------------------------------------------------------------------
create sequence public.enquiry_number_seq start 1001;

create table public.enquiries (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique default ('ENQ-' || nextval('public.enquiry_number_seq')),
  user_id       uuid references auth.users (id) on delete set null,
  name          text not null check (length(name) between 2 and 80),
  phone         text not null check (phone ~ '^[+]?[0-9 ]{10,15}$'),
  email         text check (email is null or email ~ '^\S+@\S+\.\S+$'),
  city          text check (city is null or length(city) <= 80),
  message       text check (message is null or length(message) <= 1000),
  status        public.enquiry_status not null default 'new',
  admin_note    text,
  total         numeric(10, 2) not null default 0,
  item_count    int not null default 0,
  source        text not null default 'web' check (source in ('web', 'app')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index enquiries_status_idx on public.enquiries (status, created_at desc);
create index enquiries_user_idx on public.enquiries (user_id);

create trigger enquiries_updated_at before update on public.enquiries
  for each row execute function public.set_updated_at();

create table public.enquiry_items (
  id          uuid primary key default gen_random_uuid(),
  enquiry_id  uuid not null references public.enquiries (id) on delete cascade,
  product_id  uuid references public.products (id) on delete set null,
  sku         text not null,
  name        text not null,
  price       numeric(10, 2) not null,
  quantity    int not null check (quantity between 1 and 50)
);

create index enquiry_items_enquiry_idx on public.enquiry_items (enquiry_id);

-- The only way to create an enquiry. Prices and names are read from the catalog here,
-- never trusted from the browser or app. Works for guests and signed-in customers.
create or replace function public.submit_enquiry(
  p_name text, p_phone text, p_email text, p_city text, p_message text,
  p_items jsonb, p_source text default 'web'
) returns table (id uuid, number text)
language plpgsql security definer set search_path = public as $$
declare
  v_enquiry public.enquiries;
  v_item jsonb;
  v_product record;
  v_qty int;
  v_total numeric := 0;
  v_count int := 0;
  v_recent int;
begin
  if not (select enquiries_open from public.store_settings where store_settings.id = 1) then
    raise exception 'Enquiries are closed right now. Please call or WhatsApp us.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one piece to your enquiry';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'An enquiry can have at most 30 different pieces';
  end if;

  -- Simple flood protection: at most 5 enquiries per phone number per hour.
  select count(*) into v_recent from public.enquiries e
   where e.phone = trim(p_phone) and e.created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'Too many enquiries from this number. Please wait a while or WhatsApp us.';
  end if;

  insert into public.enquiries (user_id, name, phone, email, city, message, source)
  values (auth.uid(), trim(p_name), trim(p_phone), nullif(trim(coalesce(p_email, '')), ''),
          nullif(trim(coalesce(p_city, '')), ''), nullif(trim(coalesce(p_message, '')), ''),
          coalesce(p_source, 'web'))
  returning * into v_enquiry;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::int, 1);
    if v_qty < 1 or v_qty > 50 then
      raise exception 'Quantity must be between 1 and 50';
    end if;
    select c.id, c.sku, c.name, c.price into v_product
      from public.catalog c where c.id = (v_item ->> 'product_id')::uuid;
    if not found then
      raise exception 'A piece in your enquiry is no longer available. Please remove it and try again.';
    end if;
    insert into public.enquiry_items (enquiry_id, product_id, sku, name, price, quantity)
    values (v_enquiry.id, v_product.id, v_product.sku, v_product.name, v_product.price, v_qty);
    v_total := v_total + v_product.price * v_qty;
    v_count := v_count + v_qty;
  end loop;

  update public.enquiries e set total = v_total, item_count = v_count where e.id = v_enquiry.id;
  return query select v_enquiry.id, v_enquiry.number;
end;
$$;

revoke all on function public.submit_enquiry(text, text, text, text, text, jsonb, text) from public;
grant execute on function public.submit_enquiry(text, text, text, text, text, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.store_settings  enable row level security;
alter table public.categories      enable row level security;
alter table public.subcategories   enable row level security;
alter table public.products        enable row level security;
alter table public.enquiries       enable row level security;
alter table public.enquiry_items   enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'store_settings', 'categories', 'subcategories', 'products',
    'enquiries', 'enquiry_items'
  ] loop
    execute format(
      'create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end;
$$;

create policy own_select on public.profiles for select to authenticated using (id = auth.uid());
create policy own_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy public_read on public.store_settings for select to anon, authenticated using (true);

create policy public_read on public.categories for select to anon, authenticated using (is_active and is_visible);
create policy public_read on public.subcategories for select to anon, authenticated using (is_active);
create policy public_read on public.products for select to anon, authenticated using (is_active and is_visible);

-- Customers see their own enquiries (created through submit_enquiry only).
create policy own_select on public.enquiries for select to authenticated using (user_id = auth.uid());
create policy own_select on public.enquiry_items for select to authenticated
  using (exists (select 1 from public.enquiries e where e.id = enquiry_id and e.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: product and category photos (public read, admin / shop software write)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('catalog', 'catalog', true, 8 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']);

create policy "public read catalog photos" on storage.objects for select to anon, authenticated
  using (bucket_id = 'catalog');

create policy "admin manages catalog photos" on storage.objects for all to authenticated
  using (bucket_id = 'catalog' and public.is_admin())
  with check (bucket_id = 'catalog' and public.is_admin());
