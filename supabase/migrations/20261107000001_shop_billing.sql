-- Billing improvements for the online shop software (/shop-admin):
--   * a bill no longer needs a shop location: stock is taken from wherever the product is
--     (the location holding the most first, then the next; equal stock: by location name);
--   * discount as a percentage or as a rupee amount;
--   * customers, found by phone number, with their past bills.

-- ---------------------------------------------------------------------------------------------- phones
-- '+91 98765-43210', '098765 43210' and '9876543210' are the same customer: keep digits, drop +91 / 0.
create or replace function public.shop_clean_phone(p text)
returns text
language sql
immutable
as $$
  select case
    when d ~ '^91[0-9]{10}$' then substr(d, 3)
    when d ~ '^0[0-9]{10}$' then substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- ---------------------------------------------------------------------------------------------- customers
create table public.shop_customers (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null unique check (phone ~ '^[0-9]{7,15}$'),
  name        text not null default '',
  email       text not null default '',
  address     text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.shop_customers enable row level security;
revoke all on public.shop_customers from anon, public;
create policy admin_all on public.shop_customers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create trigger shop_customers_updated_at before update on public.shop_customers
  for each row execute function public.set_updated_at();

alter table public.shop_sales
  add column customer_id    uuid references public.shop_customers (id) on delete set null,
  add column discount_type  text not null default 'amount' check (discount_type in ('amount', 'percent')),
  add column discount_value numeric(12, 2) not null default 0 check (discount_value >= 0);
create index shop_sales_customer on public.shop_sales (customer_id, created_at desc);

-- Customers from the bills made so far (the name from their latest bill that has one).
insert into public.shop_customers (phone, name, created_at)
select distinct on (ph) ph, customer_name, first_at
  from (select public.shop_clean_phone(customer_phone) as ph, customer_name, created_at,
               min(created_at) over (partition by public.shop_clean_phone(customer_phone)) as first_at
          from public.shop_sales) s
 where ph ~ '^[0-9]{7,15}$'
 order by ph, (customer_name = ''), created_at desc;
update public.shop_sales s set customer_id = c.id
  from public.shop_customers c
 where public.shop_clean_phone(s.customer_phone) = c.phone;

-- ---------------------------------------------------------------------------------------------- sales
-- p: {location_id?, customer_phone?, customer_name?, customer_email?, customer_address?,
--     discount_type? ('amount' | 'percent'), discount_value?, discount? (older form: an amount),
--     payment_method?, notes?, items: [{product_id, qty, price}]}
-- No location_id (the normal way): each item is taken from the location holding the most stock first.
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
  v_need int;
  v_take int;
  v_price numeric;
  have int;
  prod record;
  st record;
  v_sub numeric := 0;
  v_dtype text := coalesce(nullif(p->>'discount_type', ''), 'amount');
  v_dval numeric := coalesce(nullif(p->>'discount_value', '')::numeric, nullif(p->>'discount', '')::numeric, 0);
  v_disc numeric;
  v_phone text := public.shop_clean_phone(p->>'customer_phone');
  v_name text := left(trim(coalesce(p->>'customer_name', '')), 120);
  v_cust uuid;
begin
  perform public.shop_require_admin();
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Add at least one item to the bill.';
  end if;
  if v_dtype not in ('amount', 'percent') then raise exception 'Unknown discount type.'; end if;
  if v_dval < 0 then raise exception 'Discount cannot be negative.'; end if;
  if v_dtype = 'percent' and v_dval > 100 then raise exception 'Discount cannot be more than 100%%.'; end if;

  -- customer (optional): found or added by phone number
  if v_phone <> '' then
    if v_phone !~ '^[0-9]{7,15}$' then raise exception 'The phone number does not look right.'; end if;
    insert into public.shop_customers as c (phone, name, email, address)
    values (v_phone, v_name, left(trim(coalesce(p->>'customer_email', '')), 120),
            left(trim(coalesce(p->>'customer_address', '')), 300))
    on conflict (phone) do update set
      name = case when excluded.name <> '' then excluded.name else c.name end,
      email = case when excluded.email <> '' then excluded.email else c.email end,
      address = case when excluded.address <> '' then excluded.address else c.address end
    returning id, name into v_cust, v_name;
  end if;

  insert into public.shop_sales (customer_id, customer_name, customer_phone, location_id, payment_method, notes)
  values (v_cust, v_name, v_phone, v_loc, coalesce(nullif(p->>'payment_method', ''), 'cash'), coalesce(p->>'notes', ''))
  returning * into v_sale;

  for it in select * from jsonb_array_elements(p->'items') loop
    v_pid := (it->>'product_id')::uuid;
    v_qty := coalesce((it->>'qty')::int, 1);
    if v_qty <= 0 then raise exception 'Quantity must be at least 1.'; end if;
    select id, sku, name, price into prod from public.products where id = v_pid;
    if not found then raise exception 'A product on the bill no longer exists.'; end if;
    v_price := coalesce(nullif(it->>'price', '')::numeric, prod.price);
    if v_price < 0 then raise exception 'Price cannot be negative.'; end if;

    if v_loc is not null then
      select qty into have from public.shop_stock where product_id = v_pid and location_id = v_loc for update;
      if coalesce(have, 0) < v_qty then
        raise exception 'Not enough stock of % at this location (have %, bill needs %).', prod.sku, coalesce(have, 0), v_qty;
      end if;
      update public.shop_stock set qty = qty - v_qty where product_id = v_pid and location_id = v_loc;
      insert into public.shop_stock_moves (product_id, location_id, change, reason, ref)
      values (v_pid, v_loc, -v_qty, 'sale', v_sale.number);
    else
      perform 1 from public.shop_stock where product_id = v_pid for update;
      select coalesce(sum(qty), 0) into have from public.shop_stock where product_id = v_pid;
      if have < v_qty then
        raise exception 'Not enough stock of % (have %, bill needs %).', prod.sku, have, v_qty;
      end if;
      v_need := v_qty;
      for st in select s.location_id, s.qty from public.shop_stock s join public.shop_locations l on l.id = s.location_id
                 where s.product_id = v_pid and s.qty > 0 order by s.qty desc, l.name, l.id loop
        exit when v_need <= 0;
        v_take := least(st.qty, v_need);
        update public.shop_stock set qty = qty - v_take where product_id = v_pid and location_id = st.location_id;
        insert into public.shop_stock_moves (product_id, location_id, change, reason, ref)
        values (v_pid, st.location_id, -v_take, 'sale', v_sale.number);
        v_need := v_need - v_take;
      end loop;
    end if;

    insert into public.shop_sale_items (sale_id, product_id, sku, name, qty, price, line_total)
    values (v_sale.id, v_pid, prod.sku, prod.name, v_qty, v_price, v_qty * v_price);
    v_sub := v_sub + v_qty * v_price;
  end loop;

  v_disc := case when v_dtype = 'percent' then round(v_sub * v_dval / 100, 2) else v_dval end;
  if v_disc > v_sub then raise exception 'Discount cannot be more than the bill amount.'; end if;
  update public.shop_sales
     set subtotal = v_sub, discount = v_disc, total = v_sub - v_disc,
         discount_type = case when v_disc > 0 then v_dtype else 'amount' end,
         discount_value = case when v_disc > 0 then v_dval else 0 end
   where id = v_sale.id;
  return jsonb_build_object('id', v_sale.id, 'number', v_sale.number, 'total', v_sub - v_disc, 'discount', v_disc);
end;
$$;

-- Cancel a bill: every piece goes back to the location it was taken from.
create or replace function public.shop_cancel_sale(p_sale uuid)
returns void
language plpgsql
as $$
declare
  v_sale public.shop_sales;
  mv record;
begin
  perform public.shop_require_admin();
  select * into v_sale from public.shop_sales where id = p_sale for update;
  if not found then raise exception 'Bill not found.'; end if;
  if v_sale.status = 'cancelled' then raise exception 'This bill is already cancelled.'; end if;
  for mv in select product_id, location_id, -sum(change)::int as qty from public.shop_stock_moves
             where reason = 'sale' and ref = v_sale.number and location_id is not null
             group by product_id, location_id loop
    insert into public.shop_stock (product_id, location_id, qty) values (mv.product_id, mv.location_id, mv.qty)
    on conflict (product_id, location_id) do update set qty = public.shop_stock.qty + excluded.qty;
    insert into public.shop_stock_moves (product_id, location_id, change, reason, ref)
    values (mv.product_id, mv.location_id, mv.qty, 'cancel', v_sale.number);
  end loop;
  update public.shop_sales set status = 'cancelled' where id = p_sale;
end;
$$;
