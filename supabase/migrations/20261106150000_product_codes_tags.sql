-- Product codes like IB850G, customizable jewellery tags (80 x 12 mm) and stock age.
--
-- IB850G = I (Imitation) + B (Bangalore, the location's code) + 8 (the vendor's number among the vendors in
-- Bangalore) + 50 (product serial) + G (6 months guarantee from the manufacturer).  The order of the parts is a
-- pattern in the shop settings, so it can be changed later.

-- ---------------------------------------------------------------------------------------------- columns
alter table public.shop_locations
  add column code text check (code ~ '^[A-Z0-9]{1,4}$');            -- B for Bangalore, H for Hyderabad

alter table public.shop_vendors
  add column location_id uuid references public.shop_locations (id) on delete set null,  -- the vendor's city
  add column code_no int check (code_no between 0 and 9999),        -- 8 = 8th vendor in that city
  add column next_serial int not null default 1 check (next_serial between 0 and 999999999);

alter table public.shop_products
  add column guarantee_months int not null default 0 check (guarantee_months between 0 and 120);

alter table public.shop_settings
  add column code_pattern text not null default '{TYPE}{LOC}{VENDOR}{SERIAL}{G}'
    check (length(code_pattern) between 1 and 60 and code_pattern like '%{SERIAL}%'),
  add column code_type text not null default 'I' check (code_type ~ '^[A-Z0-9]{0,4}$'),
  add column guarantee_letter text not null default 'G' check (guarantee_letter ~ '^[A-Z0-9]{0,4}$'),
  add column guarantee_months int not null default 6 check (guarantee_months between 0 and 120),
  add column serial_scope text not null default 'vendor' check (serial_scope in ('vendor', 'shop')),
  add column next_serial int not null default 1 check (next_serial between 0 and 999999999),   -- the shop serial number
  add column serial_digits int not null default 0 check (serial_digits between 0 and 9),
  add column tag_layout jsonb not null default '{}'::jsonb check (jsonb_typeof(tag_layout) = 'object');

-- The shop's tags are 80 x 12 mm jewellery tags with a tail.
alter table public.shop_settings alter column tag_width_mm set default 80;
update public.shop_settings set tag_width_mm = 80, tag_height_mm = 12 where id = 1 and tag_width_mm = 18 and tag_height_mm = 12;

-- ---------------------------------------------------------------------------------------------- codes
-- The code for one serial number, or null when the vendor (or its city) has no code yet.
create or replace function public.shop_scheme_format(p_vendor uuid, p_location uuid, p_guarantee boolean, p_serial int)
returns text
language plpgsql
stable
as $$
declare
  s public.shop_settings;
  v public.shop_vendors;
  loc_code text;
begin
  select * into s from public.shop_settings where id = 1;
  select * into v from public.shop_vendors where id = p_vendor;
  if s is null or v.id is null or v.code_no is null then return null; end if;
  select code into loc_code from public.shop_locations where id = coalesce(v.location_id, p_location);
  if loc_code is null and s.code_pattern like '%{LOC}%' then return null; end if;
  return upper(replace(replace(replace(replace(replace(s.code_pattern,
    '{TYPE}', s.code_type),
    '{LOC}', coalesce(loc_code, '')),
    '{VENDOR}', v.code_no::text),
    '{SERIAL}', lpad(p_serial::text, greatest(s.serial_digits, length(p_serial::text)), '0')),
    '{G}', case when p_guarantee then s.guarantee_letter else '' end));
end;
$$;

-- Next code from the scheme: {sku, serial, match: 'scheme'}; {sku: ''} when the vendor has no number yet.
create or replace function public.shop_scheme_code(p_vendor uuid, p_location uuid default null, p_guarantee boolean default false)
returns jsonb
language plpgsql
stable
as $$
declare
  s public.shop_settings;
  serial int;
  candidate text;
  i int := 0;
begin
  perform public.shop_require_admin();
  select * into s from public.shop_settings where id = 1;
  if s.serial_scope = 'shop' then
    serial := s.next_serial;
  else
    select next_serial into serial from public.shop_vendors where id = p_vendor;
  end if;
  serial := coalesce(serial, 1);
  loop
    candidate := public.shop_scheme_format(p_vendor, p_location, p_guarantee, serial);
    if candidate is null then
      return jsonb_build_object('sku', '', 'serial', null, 'match', '');
    end if;
    -- Skip codes already used, with or without the guarantee letter (IB850 and IB850G are the same piece number).
    exit when not exists (
      select 1 from public.products
       where upper(sku) in (public.shop_scheme_format(p_vendor, p_location, true, serial),
                            public.shop_scheme_format(p_vendor, p_location, false, serial)));
    serial := serial + 1;
    i := i + 1;
    if i > 10000 then return jsonb_build_object('sku', '', 'serial', null, 'match', ''); end if;
  end loop;
  return jsonb_build_object('sku', candidate, 'serial', serial, 'match', 'scheme', 'based_on', '');
end;
$$;

-- The code to suggest on the Add product page: the scheme when the vendor has a number, else the old way
-- (follow the last code of the same category + vendor + location).
create or replace function public.shop_suggest_code(p_category uuid default null, p_vendor uuid default null, p_location uuid default null,
                                                    p_guarantee boolean default false)
returns jsonb
language plpgsql
stable
as $$
declare r jsonb;
begin
  perform public.shop_require_admin();
  if p_vendor is not null then
    r := public.shop_scheme_code(p_vendor, p_location, p_guarantee);
    if r->>'sku' <> '' then return r; end if;
  end if;
  return public.shop_next_code(p_category, p_vendor, p_location);
end;
$$;

-- A vendor's number when it is added: the next number among vendors of the same city.
create or replace function public.shop_next_vendor_no(p_location uuid)
returns int
language sql
stable
as $$
  select coalesce(max(code_no), 0) + 1 from public.shop_vendors where location_id is not distinct from p_location;
$$;

-- ---------------------------------------------------------------------------------------------- products
-- Same as before, plus: guarantee (months) and, when the code came from the scheme (code_serial), moving the
-- vendor's (or the shop's) serial number on.
create or replace function public.shop_save_product(p jsonb)
returns uuid
language plpgsql
as $$
declare
  pid uuid := nullif(p->>'id', '')::uuid;
  v_sku text := upper(trim(coalesce(p->>'sku', '')));
  v_name text := trim(coalesce(p->>'name', ''));
  v_loc uuid := nullif(p->>'location_id', '')::uuid;
  v_vendor uuid := nullif(p->>'vendor_id', '')::uuid;
  v_qty int := coalesce(nullif(p->>'opening_qty', '')::int, 0);
  v_barcode text := nullif(trim(coalesce(p->>'barcode', '')), '');
  v_guar int := coalesce(nullif(p->>'guarantee_months', '')::int, 0);
  v_serial int := nullif(p->>'code_serial', '')::int;
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
  if v_guar < 0 or v_guar > 120 then raise exception 'Guarantee must be 0 to 120 months.'; end if;
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
                                          purchase_date, invoice_no, rack, guarantee_months)
  values (pid, v_barcode, v_vendor, v_loc,
          coalesce(nullif(p->>'purchase_rate', '')::numeric, 0), nullif(p->>'multiplier', '')::numeric,
          coalesce(nullif(p->>'purchase_date', '')::date, (now() at time zone 'Asia/Kolkata')::date),
          coalesce(p->>'invoice_no', ''), coalesce(p->>'rack', ''), v_guar)
  on conflict (product_id) do update set
    barcode = coalesce(excluded.barcode, sp.barcode),
    vendor_id = excluded.vendor_id, location_id = excluded.location_id,
    purchase_rate = excluded.purchase_rate, multiplier = excluded.multiplier,
    purchase_date = excluded.purchase_date, invoice_no = excluded.invoice_no, rack = excluded.rack,
    guarantee_months = case when p ? 'guarantee_months' then excluded.guarantee_months else sp.guarantee_months end;

  -- The code came from the scheme: the next product gets the next serial.
  if is_new and v_serial is not null and v_vendor is not null
     and v_sku in (public.shop_scheme_format(v_vendor, v_loc, true, v_serial),
                   public.shop_scheme_format(v_vendor, v_loc, false, v_serial)) then
    if (select serial_scope from public.shop_settings where id = 1) = 'shop' then
      update public.shop_settings set next_serial = greatest(next_serial, v_serial + 1) where id = 1;
    else
      update public.shop_vendors set next_serial = greatest(next_serial, v_serial + 1) where id = v_vendor;
    end if;
  end if;

  if is_new and v_qty > 0 then
    insert into public.shop_stock (product_id, location_id, qty) values (pid, v_loc, v_qty);
    insert into public.shop_stock_moves (product_id, location_id, change, reason)
    values (pid, v_loc, v_qty, 'opening');
  end if;
  return pid;
end;
$$;

-- ---------------------------------------------------------------------------------------------- stock age
-- How long each product has been in the shop: from its purchase date (or the day it was added).
create or replace view public.shop_stock_age
with (security_invoker = true) as
select p.id, p.sku, p.name, p.stock_qty, p.is_active, p.price,
       coalesce(sp.purchase_rate, 0) as purchase_rate,
       coalesce(sp.purchase_date, (p.added_at at time zone 'Asia/Kolkata')::date) as since,
       ((now() at time zone 'Asia/Kolkata')::date
         - coalesce(sp.purchase_date, (p.added_at at time zone 'Asia/Kolkata')::date)) as age_days
  from public.products p
  left join public.shop_products sp on sp.product_id = p.id
 where public.is_admin();
revoke all on public.shop_stock_age from anon, public;
grant select on public.shop_stock_age to authenticated;

-- Pieces in stock by age, for the dashboard.
create or replace function public.shop_stock_age_summary()
returns jsonb
language plpgsql
stable
as $$
declare out jsonb;
begin
  perform public.shop_require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('bucket', b.bucket, 'products', coalesce(x.products, 0),
                                               'pieces', coalesce(x.pieces, 0), 'cost', coalesce(x.cost, 0),
                                               'value', coalesce(x.value, 0)) order by b.bucket), '[]')
    into out
    from (values (0), (1), (2), (3), (4)) b(bucket)
    left join (
      select case when age_days <= 30 then 0 when age_days <= 90 then 1 when age_days <= 180 then 2
                  when age_days <= 365 then 3 else 4 end as bucket,
             count(*) as products, sum(stock_qty) as pieces,
             sum(stock_qty * purchase_rate) as cost, sum(stock_qty * price) as value
        from public.shop_stock_age
       where is_active and stock_qty > 0
       group by 1
    ) x on x.bucket = b.bucket;
  return out;
end;
$$;

-- ---------------------------------------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array['shop_scheme_format(uuid, uuid, boolean, int)', 'shop_scheme_code(uuid, uuid, boolean)',
                           'shop_suggest_code(uuid, uuid, uuid, boolean)', 'shop_next_vendor_no(uuid)',
                           'shop_save_product(jsonb)', 'shop_stock_age_summary()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
