-- Shop software, online and free: runs inside the website at 1gram.abharanamcollections.com/shop-admin.
--
-- The products themselves are the website's products table (one list for the shop and the website).
-- Everything private (purchase rates, vendors, locations, stock per location, sales) is in the shop_* tables
-- below.  Only a website admin (profiles.role = 'admin') can read or change them: customers and visitors
-- get nothing, not even an empty list.

-- ---------------------------------------------------------------------------------------------- tables
create table public.shop_vendors (
  id          uuid primary key default gen_random_uuid(),
  local_id    text unique,                         -- VEN-0001 in the shop computer's software
  name        text not null check (length(trim(name)) between 1 and 120),
  phone       text not null default '',
  notes       text not null default '',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.shop_locations (
  id          uuid primary key default gen_random_uuid(),
  local_id    text unique,                         -- LOC-0001
  name        text not null check (length(trim(name)) between 1 and 120),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Shop-only details of each product.
create table public.shop_products (
  product_id     uuid primary key references public.products (id) on delete cascade,
  barcode        text unique,
  vendor_id      uuid references public.shop_vendors (id) on delete set null,
  location_id    uuid references public.shop_locations (id) on delete set null,   -- where it was bought
  purchase_rate  numeric(10, 2) not null default 0 check (purchase_rate >= 0),
  multiplier     numeric(6, 3),                    -- selling price = purchase rate x this (when used)
  purchase_date  date,
  invoice_no     text not null default '',
  rack           text not null default '',
  updated_at     timestamptz not null default now()
);

create table public.shop_stock (
  product_id   uuid not null references public.products (id) on delete cascade,
  location_id  uuid not null references public.shop_locations (id) on delete cascade,
  qty          int not null default 0 check (qty >= 0),
  primary key (product_id, location_id)
);

create table public.shop_stock_moves (
  id           bigint generated always as identity primary key,
  product_id   uuid not null references public.products (id) on delete cascade,
  location_id  uuid references public.shop_locations (id) on delete set null,
  change       int not null,
  reason       text not null check (reason in ('opening', 'adjust', 'sale', 'cancel', 'import')),
  ref          text not null default '',
  note         text not null default '',
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index shop_stock_moves_product on public.shop_stock_moves (product_id, created_at desc);

create sequence public.shop_sale_number_seq;

create table public.shop_sales (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique default ('INV-' || lpad(nextval('public.shop_sale_number_seq')::text, 5, '0')),
  customer_name   text not null default '',
  customer_phone  text not null default '',
  location_id     uuid references public.shop_locations (id) on delete set null,
  subtotal        numeric(12, 2) not null default 0,
  discount        numeric(12, 2) not null default 0 check (discount >= 0),
  total           numeric(12, 2) not null default 0 check (total >= 0),
  payment_method  text not null default 'cash',
  notes           text not null default '',
  status          text not null default 'paid' check (status in ('paid', 'cancelled')),
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);
create index shop_sales_created on public.shop_sales (created_at desc);

create table public.shop_sale_items (
  id          bigint generated always as identity primary key,
  sale_id     uuid not null references public.shop_sales (id) on delete cascade,
  product_id  uuid references public.products (id) on delete set null,
  sku         text not null,
  name        text not null,
  qty         int not null check (qty > 0),
  price       numeric(10, 2) not null check (price >= 0),
  line_total  numeric(12, 2) not null
);
create index shop_sale_items_sale on public.shop_sale_items (sale_id);

-- One row of shop settings.
create table public.shop_settings (
  id                  int primary key default 1 check (id = 1),
  default_multiplier  numeric(6, 3) not null default 2 check (default_multiplier > 0),
  tag_width_mm        numeric(5, 1) not null default 18 check (tag_width_mm between 10 and 120),
  tag_height_mm       numeric(5, 1) not null default 12 check (tag_height_mm between 8 and 120),
  bill_footer         text not null default 'Thank you! Visit again.',
  updated_at          timestamptz not null default now()
);
insert into public.shop_settings (id) values (1);

-- ---------------------------------------------------------------------------------------------- security
do $$
declare t text;
begin
  foreach t in array array['shop_vendors', 'shop_locations', 'shop_products', 'shop_stock', 'shop_stock_moves',
                           'shop_sales', 'shop_sale_items', 'shop_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('create policy admin_all on public.%I for all to authenticated '
                   'using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
revoke all on sequence public.shop_sale_number_seq from anon, public;

-- products.stock_qty (what the website shows) is the total over all locations.
create or replace function public.shop_stock_total()
returns trigger
language plpgsql
as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products
     set stock_qty = coalesce((select sum(qty) from public.shop_stock where product_id = pid), 0)
   where id = pid;
  if tg_op = 'UPDATE' and old.product_id <> new.product_id then
    update public.products
       set stock_qty = coalesce((select sum(qty) from public.shop_stock where product_id = old.product_id), 0)
     where id = old.product_id;
  end if;
  return null;
end;
$$;
create trigger shop_stock_total after insert or update or delete on public.shop_stock
  for each row execute function public.shop_stock_total();

create trigger shop_products_updated_at before update on public.shop_products
  for each row execute function public.set_updated_at();
create trigger shop_settings_updated_at before update on public.shop_settings
  for each row execute function public.set_updated_at();

create or replace function public.shop_require_admin()
returns void
language plpgsql
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the shop admin can do this.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------- codes
-- IB4501 -> IB4502, IH615-LOT009 -> IH615-LOT010 (keeps leading zeros); no digits -> add 1.
create or replace function public.shop_bump_code(p_code text)
returns text
language plpgsql
immutable
as $$
declare m text[];
begin
  m := regexp_match(p_code, '^(.*[^0-9])?([0-9]+)([^0-9]*)$');
  if m is null then
    return p_code || '1';
  end if;
  return coalesce(m[1], '') || lpad((m[2]::numeric + 1)::text, greatest(length(m[2]), length((m[2]::numeric + 1)::text)), '0') || m[3];
end;
$$;

-- The next product code for this category + vendor + location: it follows the last product added with the
-- same three; if there is none, the last one with the same category + location; if none, ABH-<code>-000001.
create or replace function public.shop_next_code(p_category uuid, p_vendor uuid default null, p_location uuid default null)
returns jsonb
language plpgsql
stable
as $$
declare
  last_sku text;
  how text := 'category_vendor_location';
  candidate text;
  cat_code text;
  i int := 0;
begin
  perform public.shop_require_admin();
  if p_category is null then
    return jsonb_build_object('sku', '', 'based_on', '', 'match', '');
  end if;
  select p.sku into last_sku
    from public.products p join public.shop_products sp on sp.product_id = p.id
   where p.category_id = p_category and sp.location_id is not distinct from p_location
     and sp.vendor_id is not distinct from p_vendor
   order by p.added_at desc, p.created_at desc limit 1;
  if last_sku is null then
    how := 'category_location';
    select p.sku into last_sku
      from public.products p left join public.shop_products sp on sp.product_id = p.id
     where p.category_id = p_category and sp.location_id is not distinct from p_location
     order by p.added_at desc, p.created_at desc limit 1;
  end if;
  if last_sku is null then
    how := 'new';
    select upper(coalesce(nullif(code, ''), left(regexp_replace(name, '[^A-Za-z]', '', 'g'), 3)))
      into cat_code from public.categories where id = p_category;
    candidate := 'ABH-' || coalesce(nullif(cat_code, ''), 'GEN') || '-000000';
  else
    candidate := last_sku;
  end if;
  loop
    candidate := public.shop_bump_code(candidate);
    exit when not exists (select 1 from public.products where upper(sku) = upper(candidate));
    i := i + 1;
    if i > 10000 then
      return jsonb_build_object('sku', '', 'based_on', coalesce(last_sku, ''), 'match', how);
    end if;
  end loop;
  return jsonb_build_object('sku', candidate, 'based_on', coalesce(last_sku, ''), 'match', how);
end;
$$;

-- Barcodes are numbers from 100000 up.
create or replace function public.shop_next_barcode()
returns text
language plpgsql
stable
as $$
declare n bigint;
begin
  perform public.shop_require_admin();
  select coalesce(max(barcode::bigint), 99999) + 1 into n
    from public.shop_products where barcode ~ '^\d{1,15}$';
  return greatest(n, 100000)::text;
end;
$$;

-- ---------------------------------------------------------------------------------------------- products
-- Add or change a product with its shop details, all in one step.
-- p: {id?, sku, name, category_id, subcategory_id?, description?, price, mrp?, collection?, material?, colour?,
--     size?, design_number?, tags?, is_active?, vendor_id?, location_id?, purchase_rate, multiplier?,
--     purchase_date?, invoice_no?, rack?, barcode?, opening_qty? (new products only)}
create or replace function public.shop_save_product(p jsonb)
returns uuid
language plpgsql
as $$
declare
  pid uuid := nullif(p->>'id', '')::uuid;
  v_sku text := upper(trim(coalesce(p->>'sku', '')));
  v_name text := trim(coalesce(p->>'name', ''));
  v_loc uuid := nullif(p->>'location_id', '')::uuid;
  v_qty int := coalesce(nullif(p->>'opening_qty', '')::int, 0);
  v_barcode text := nullif(trim(coalesce(p->>'barcode', '')), '');
  is_new boolean := pid is null;
begin
  perform public.shop_require_admin();
  if v_name = '' then raise exception 'Product name is required.'; end if;
  if v_sku = '' then raise exception 'Product code is required.'; end if;
  if v_sku !~ '^[A-Z0-9][A-Z0-9_./-]{0,39}$' then
    raise exception 'Product code can only have letters, numbers and - _ . / (up to 40).';
  end if;
  if exists (select 1 from public.products where upper(sku) = v_sku and id is distinct from pid) then
    raise exception 'Product code % is already used.', v_sku;
  end if;
  if v_qty < 0 then raise exception 'Quantity cannot be negative.'; end if;
  if is_new and v_qty > 0 and v_loc is null then
    raise exception 'Choose the location for the opening stock.';
  end if;

  if is_new then
    insert into public.products (sku, name, category_id, subcategory_id, description, price, mrp, collection,
                                 material, colour, size, design_number, tags, is_active)
    values (v_sku, v_name, nullif(p->>'category_id', '')::uuid, nullif(p->>'subcategory_id', '')::uuid,
            coalesce(p->>'description', ''), coalesce(nullif(p->>'price', '')::numeric, 0),
            nullif(p->>'mrp', '')::numeric, coalesce(p->>'collection', ''), coalesce(p->>'material', ''),
            coalesce(p->>'colour', ''), coalesce(p->>'size', ''), coalesce(p->>'design_number', ''),
            coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'tags', '[]')) x), '{}'),
            coalesce((p->>'is_active')::boolean, true))
    returning id into pid;
    if v_barcode is null then
      v_barcode := public.shop_next_barcode();
    end if;
  else
    update public.products set
      sku = v_sku, name = v_name,
      category_id = nullif(p->>'category_id', '')::uuid,
      subcategory_id = nullif(p->>'subcategory_id', '')::uuid,
      description = coalesce(p->>'description', description),
      price = coalesce(nullif(p->>'price', '')::numeric, price),
      mrp = nullif(p->>'mrp', '')::numeric,
      collection = coalesce(p->>'collection', collection),
      material = coalesce(p->>'material', material),
      colour = coalesce(p->>'colour', colour),
      size = coalesce(p->>'size', size),
      design_number = coalesce(p->>'design_number', design_number),
      tags = case when p ? 'tags' then coalesce((select array_agg(x) from jsonb_array_elements_text(p->'tags') x), '{}') else tags end,
      is_active = coalesce((p->>'is_active')::boolean, is_active)
    where id = pid;
    if not found then raise exception 'Product not found.'; end if;
  end if;

  if v_barcode is not null and exists (select 1 from public.shop_products where barcode = v_barcode and product_id <> pid) then
    raise exception 'Barcode % is already used.', v_barcode;
  end if;

  insert into public.shop_products as sp (product_id, barcode, vendor_id, location_id, purchase_rate, multiplier,
                                          purchase_date, invoice_no, rack)
  values (pid, v_barcode, nullif(p->>'vendor_id', '')::uuid, v_loc,
          coalesce(nullif(p->>'purchase_rate', '')::numeric, 0), nullif(p->>'multiplier', '')::numeric,
          coalesce(nullif(p->>'purchase_date', '')::date, (now() at time zone 'Asia/Kolkata')::date),
          coalesce(p->>'invoice_no', ''), coalesce(p->>'rack', ''))
  on conflict (product_id) do update set
    barcode = coalesce(excluded.barcode, sp.barcode),
    vendor_id = excluded.vendor_id, location_id = excluded.location_id,
    purchase_rate = excluded.purchase_rate, multiplier = excluded.multiplier,
    purchase_date = excluded.purchase_date, invoice_no = excluded.invoice_no, rack = excluded.rack;

  if is_new and v_qty > 0 then
    insert into public.shop_stock (product_id, location_id, qty) values (pid, v_loc, v_qty);
    insert into public.shop_stock_moves (product_id, location_id, change, reason)
    values (pid, v_loc, v_qty, 'opening');
  end if;
  return pid;
end;
$$;

-- Set the quantity of a product at a location (stock count, damage, found ...).
create or replace function public.shop_set_stock(p_product uuid, p_location uuid, p_qty int, p_note text default '')
returns int
language plpgsql
as $$
declare old_qty int;
begin
  perform public.shop_require_admin();
  if p_qty is null or p_qty < 0 then raise exception 'Quantity cannot be negative.'; end if;
  select qty into old_qty from public.shop_stock where product_id = p_product and location_id = p_location for update;
  old_qty := coalesce(old_qty, 0);
  if old_qty = p_qty then return p_qty; end if;
  insert into public.shop_stock (product_id, location_id, qty) values (p_product, p_location, p_qty)
  on conflict (product_id, location_id) do update set qty = excluded.qty;
  insert into public.shop_stock_moves (product_id, location_id, change, reason, note)
  values (p_product, p_location, p_qty - old_qty, 'adjust', coalesce(p_note, ''));
  return p_qty;
end;
$$;

-- ---------------------------------------------------------------------------------------------- sales
-- p: {location_id, customer_name?, customer_phone?, discount?, payment_method?, notes?,
--     items: [{product_id, qty, price}]}
create or replace function public.shop_create_sale(p jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_loc uuid := nullif(p->>'location_id', '')::uuid;
  v_sale public.shop_sales;
  it jsonb;
  v_pid uuid;
  v_qty int;
  v_price numeric;
  have int;
  prod record;
  v_sub numeric := 0;
  v_disc numeric := coalesce(nullif(p->>'discount', '')::numeric, 0);
begin
  perform public.shop_require_admin();
  if v_loc is null then raise exception 'Choose the shop location for this bill.'; end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Add at least one item to the bill.';
  end if;
  if v_disc < 0 then raise exception 'Discount cannot be negative.'; end if;

  insert into public.shop_sales (customer_name, customer_phone, location_id, discount, payment_method, notes)
  values (trim(coalesce(p->>'customer_name', '')), trim(coalesce(p->>'customer_phone', '')), v_loc, v_disc,
          coalesce(nullif(p->>'payment_method', ''), 'cash'), coalesce(p->>'notes', ''))
  returning * into v_sale;

  for it in select * from jsonb_array_elements(p->'items') loop
    v_pid := (it->>'product_id')::uuid;
    v_qty := coalesce((it->>'qty')::int, 1);
    if v_qty <= 0 then raise exception 'Quantity must be at least 1.'; end if;
    select id, sku, name, price into prod from public.products where id = v_pid;
    if not found then raise exception 'A product on the bill no longer exists.'; end if;
    v_price := coalesce(nullif(it->>'price', '')::numeric, prod.price);
    if v_price < 0 then raise exception 'Price cannot be negative.'; end if;
    select qty into have from public.shop_stock where product_id = v_pid and location_id = v_loc for update;
    if coalesce(have, 0) < v_qty then
      raise exception 'Not enough stock of % at this location (have %, bill needs %).', prod.sku, coalesce(have, 0), v_qty;
    end if;
    update public.shop_stock set qty = qty - v_qty where product_id = v_pid and location_id = v_loc;
    insert into public.shop_stock_moves (product_id, location_id, change, reason, ref)
    values (v_pid, v_loc, -v_qty, 'sale', v_sale.number);
    insert into public.shop_sale_items (sale_id, product_id, sku, name, qty, price, line_total)
    values (v_sale.id, v_pid, prod.sku, prod.name, v_qty, v_price, v_qty * v_price);
    v_sub := v_sub + v_qty * v_price;
  end loop;

  if v_disc > v_sub then raise exception 'Discount cannot be more than the bill amount.'; end if;
  update public.shop_sales set subtotal = v_sub, total = v_sub - v_disc where id = v_sale.id;
  return jsonb_build_object('id', v_sale.id, 'number', v_sale.number, 'total', v_sub - v_disc);
end;
$$;

-- Cancel a bill: its items go back into stock.
create or replace function public.shop_cancel_sale(p_sale uuid)
returns void
language plpgsql
as $$
declare
  v_sale public.shop_sales;
  it record;
begin
  perform public.shop_require_admin();
  select * into v_sale from public.shop_sales where id = p_sale for update;
  if not found then raise exception 'Bill not found.'; end if;
  if v_sale.status = 'cancelled' then raise exception 'This bill is already cancelled.'; end if;
  for it in select * from public.shop_sale_items where sale_id = p_sale and product_id is not null loop
    if v_sale.location_id is not null then
      insert into public.shop_stock (product_id, location_id, qty) values (it.product_id, v_sale.location_id, it.qty)
      on conflict (product_id, location_id) do update set qty = public.shop_stock.qty + excluded.qty;
      insert into public.shop_stock_moves (product_id, location_id, change, reason, ref)
      values (it.product_id, v_sale.location_id, it.qty, 'cancel', v_sale.number);
    end if;
  end loop;
  update public.shop_sales set status = 'cancelled' where id = p_sale;
end;
$$;

-- ---------------------------------------------------------------------------------------------- import
-- Bring in the shop computer's data files (data/*.json).  Safe to run again: records are matched by their
-- shop id (CAT-0001, VEN-0001, LOC-0001, PRD-000001), so they are updated, not doubled.
-- p: {categories: [...], subcategories: [...], vendors: [...], locations: [...], products: [...]}
-- Returns counts, and the product codes that were imported (for matching photos named <code>.jpg).
create or replace function public.shop_import(p jsonb)
returns jsonb
language plpgsql
as $$
declare
  r jsonb;
  k text;
  n_cat int := 0; n_sub int := 0; n_ven int := 0; n_loc int := 0; n_prod int := 0; n_skip int := 0;
  pid uuid;
  v_loc uuid;
  v_barcode text;
  v_total int;
  skipped jsonb := '[]';
begin
  perform public.shop_require_admin();

  for r in select * from jsonb_array_elements(coalesce(p->'categories', '[]')) loop
    insert into public.categories (local_id, name, code, description, is_active)
    values (r->>'id', coalesce(nullif(r->>'name', ''), r->>'id'), nullif(r->>'code', ''),
            coalesce(r->>'description', ''), coalesce((r->>'active')::boolean, true))
    on conflict (local_id) do update set name = excluded.name, code = excluded.code,
      description = excluded.description, is_active = excluded.is_active;
    n_cat := n_cat + 1;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'subcategories', '[]')) loop
    if exists (select 1 from public.categories where local_id = r->>'category_id') then
      insert into public.subcategories (local_id, category_id, name, is_active)
      values (r->>'id', (select id from public.categories where local_id = r->>'category_id'),
              coalesce(nullif(r->>'name', ''), r->>'id'), coalesce((r->>'active')::boolean, true))
      on conflict (local_id) do update set category_id = excluded.category_id, name = excluded.name,
        is_active = excluded.is_active;
      n_sub := n_sub + 1;
    end if;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'vendors', '[]')) loop
    insert into public.shop_vendors (local_id, name, phone, is_active)
    values (r->>'id', coalesce(nullif(r->>'name', ''), r->>'id'), coalesce(r->>'phone', ''),
            coalesce((r->>'active')::boolean, true))
    on conflict (local_id) do update set name = excluded.name, phone = excluded.phone, is_active = excluded.is_active;
    n_ven := n_ven + 1;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'locations', '[]')) loop
    insert into public.shop_locations (local_id, name, is_active)
    values (r->>'id', coalesce(nullif(r->>'name', ''), r->>'id'), coalesce((r->>'active')::boolean, true))
    on conflict (local_id) do update set name = excluded.name, is_active = excluded.is_active;
    n_loc := n_loc + 1;
  end loop;

  -- Locations used by products but missing from the file get a placeholder (rename it later in Masters).
  insert into public.shop_locations (local_id, name)
  select distinct x, x from (
    select nullif(e->>'purchase_location_id', '') x from jsonb_array_elements(coalesce(p->'products', '[]')) e
    union
    select jsonb_object_keys(case when jsonb_typeof(e->'stock') = 'object' then e->'stock' else '{}' end)
      from jsonb_array_elements(coalesce(p->'products', '[]')) e
  ) s where x is not null
  on conflict (local_id) do nothing;

  for r in select * from jsonb_array_elements(coalesce(p->'products', '[]')) loop
    if coalesce(r->>'status', 'active') = 'deleted' or coalesce(r->>'sku', '') = '' then
      n_skip := n_skip + 1;
      continue;
    end if;
    if exists (select 1 from public.products where upper(sku) = upper(r->>'sku')
                and local_id is distinct from r->>'id') then
      n_skip := n_skip + 1;
      skipped := skipped || to_jsonb(r->>'sku');
      continue;
    end if;
    insert into public.products as pr (local_id, sku, name, category_id, subcategory_id, description, price,
                                       collection, material, colour, size, design_number, tags, is_active, added_at)
    values (r->>'id', upper(r->>'sku'), coalesce(nullif(r->>'name', ''), r->>'sku'),
            (select id from public.categories where local_id = r->>'category_id'),
            (select id from public.subcategories where local_id = nullif(r->>'subcategory_id', '')),
            coalesce(r->>'description', ''), coalesce(nullif(r->>'selling_price', '')::numeric, 0),
            coalesce(r->>'collection', ''), coalesce(r->>'material', ''), coalesce(r->>'colour', ''),
            coalesce(r->>'size', ''), coalesce(r->>'design_number', ''),
            coalesce((select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(r->'tags') = 'array' then r->'tags' else '[]' end) x), '{}'),
            coalesce(r->>'status', 'active') = 'active',
            coalesce((nullif(r->>'date_added', '') || '+05:30')::timestamptz, now()))
    on conflict (local_id) do update set sku = excluded.sku, name = excluded.name,
      category_id = excluded.category_id, subcategory_id = excluded.subcategory_id,
      description = excluded.description, price = excluded.price, collection = excluded.collection,
      material = excluded.material, colour = excluded.colour, size = excluded.size,
      design_number = excluded.design_number, tags = excluded.tags, is_active = excluded.is_active,
      added_at = excluded.added_at
    returning pr.id into pid;

    v_barcode := nullif(trim(coalesce(r->>'barcode', '')), '');
    if v_barcode is not null and exists (select 1 from public.shop_products where barcode = v_barcode and product_id <> pid) then
      v_barcode := null;
    end if;
    v_loc := (select id from public.shop_locations where local_id = nullif(r->>'purchase_location_id', ''));
    insert into public.shop_products as sp (product_id, barcode, vendor_id, location_id, purchase_rate,
                                            purchase_date, invoice_no, rack)
    values (pid, v_barcode, (select id from public.shop_vendors where local_id = nullif(r->>'vendor_id', '')), v_loc,
            coalesce(nullif(r->>'purchase_rate', '')::numeric, 0), nullif(r->>'purchase_date', '')::date,
            coalesce(r->>'purchase_invoice_no', ''), coalesce(r->>'rack', ''))
    on conflict (product_id) do update set barcode = coalesce(excluded.barcode, sp.barcode),
      vendor_id = excluded.vendor_id, location_id = excluded.location_id, purchase_rate = excluded.purchase_rate,
      purchase_date = excluded.purchase_date, invoice_no = excluded.invoice_no, rack = excluded.rack;

    -- Stock: the file's numbers replace what is online.
    if jsonb_typeof(r->'stock') = 'object' then
      delete from public.shop_stock where product_id = pid;
      v_total := 0;
      for k in select jsonb_object_keys(r->'stock') loop
        if coalesce((r->'stock'->>k)::numeric, 0) > 0 then
          insert into public.shop_stock (product_id, location_id, qty)
          values (pid, (select id from public.shop_locations where local_id = k), (r->'stock'->>k)::numeric::int);
          v_total := v_total + (r->'stock'->>k)::numeric::int;
        end if;
      end loop;
      if v_total > 0 and not exists (select 1 from public.shop_stock_moves where product_id = pid and reason = 'import') then
        insert into public.shop_stock_moves (product_id, change, reason) values (pid, v_total, 'import');
      end if;
    end if;
    n_prod := n_prod + 1;
  end loop;

  return jsonb_build_object('categories', n_cat, 'subcategories', n_sub, 'vendors', n_ven, 'locations', n_loc,
                            'products', n_prod, 'skipped', n_skip, 'skipped_codes', skipped);
end;
$$;

-- Numbers for the dashboard.
create or replace function public.shop_summary()
returns jsonb
language plpgsql
stable
as $$
declare
  out jsonb;
  day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  perform public.shop_require_admin();
  select jsonb_build_object(
    'products', (select count(*) from public.products where is_active),
    'units', coalesce((select sum(qty) from public.shop_stock), 0),
    'cost', coalesce((select sum(s.qty * coalesce(sp.purchase_rate, 0)) from public.shop_stock s
                        left join public.shop_products sp on sp.product_id = s.product_id), 0),
    'value', coalesce((select sum(s.qty * p.price) from public.shop_stock s join public.products p on p.id = s.product_id), 0),
    'sales_today', coalesce((select sum(total) from public.shop_sales where status = 'paid' and created_at >= day_start), 0),
    'bills_today', (select count(*) from public.shop_sales where status = 'paid' and created_at >= day_start)
  ) into out;
  return out;
end;
$$;

-- Only signed-in users can call these (and the functions themselves refuse anyone who is not the admin).
do $$
declare f text;
begin
  foreach f in array array['shop_require_admin()', 'shop_next_code(uuid, uuid, uuid)', 'shop_next_barcode()',
                           'shop_save_product(jsonb)', 'shop_set_stock(uuid, uuid, int, text)',
                           'shop_create_sale(jsonb)', 'shop_cancel_sale(uuid)', 'shop_import(jsonb)', 'shop_summary()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
