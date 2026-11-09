-- Shop expenses, profit, reports, returns with approval and vendor performance (online shop software).
--
--   * shop_expenses: rent, electricity, other bills, donations, salaries... by day.
--   * Each bill line keeps the purchase rate at the time of the sale (cost), so profit stays right
--     when a purchase rate is changed later.
--   * Returns and cancellations are requests first. Stock goes back only when the admin approves.
--   * shop_report: day-wise / month-wise sales, cost, profit with and without expenses.
--   * shop_breakdown / shop_vendor_report: by category, payment, product and vendor.

-- ---------------------------------------------------------------------------------------------- expenses
create table public.shop_expenses (
  id           uuid primary key default gen_random_uuid(),
  spent_on     date not null default (now() at time zone 'Asia/Kolkata')::date,
  category     text not null check (category in ('rent', 'electricity', 'bills', 'donation', 'salary',
                                                 'transport', 'maintenance', 'other')),
  amount       numeric(12, 2) not null check (amount > 0),
  paid_by      text not null default 'cash' check (paid_by in ('cash', 'upi', 'card', 'bank')),
  note         text not null default '' check (length(note) <= 300),
  location_id  uuid references public.shop_locations (id) on delete set null,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index shop_expenses_day on public.shop_expenses (spent_on desc);

-- ---------------------------------------------------------------------------------------------- bill lines
alter table public.shop_sale_items
  add column cost         numeric(10, 2) not null default 0 check (cost >= 0),   -- purchase rate when sold
  add column returned_qty int not null default 0;
alter table public.shop_sale_items
  add constraint shop_sale_items_returned_qty check (returned_qty between 0 and qty);
create index if not exists shop_sale_items_sale on public.shop_sale_items (sale_id);

-- Bills made so far: today's purchase rate is the best we know.
update public.shop_sale_items i set cost = sp.purchase_rate
  from public.shop_products sp
 where sp.product_id = i.product_id;

create index if not exists shop_sales_day on public.shop_sales (created_at desc);

alter table public.shop_stock_moves drop constraint shop_stock_moves_reason_check;
alter table public.shop_stock_moves add constraint shop_stock_moves_reason_check
  check (reason in ('opening', 'adjust', 'sale', 'cancel', 'import', 'online', 'online_cancel', 'return'));

-- ---------------------------------------------------------------------------------------------- returns
create sequence public.shop_return_number_seq;

create table public.shop_returns (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique default ('RET-' || lpad(nextval('public.shop_return_number_seq')::text, 5, '0')),
  sale_id        uuid not null references public.shop_sales (id) on delete cascade,
  kind           text not null check (kind in ('return', 'cancel')),     -- some pieces / the whole bill
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason         text not null default '' check (length(reason) <= 300),
  location_id    uuid references public.shop_locations (id) on delete set null,  -- null: back where it was sold from
  amount         numeric(12, 2) not null default 0 check (amount >= 0),  -- money back to the customer
  requested_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  decided_by     uuid references auth.users (id) on delete set null,
  decided_at     timestamptz,
  decision_note  text not null default ''
);
create unique index shop_returns_one_pending on public.shop_returns (sale_id) where status = 'pending';
create index shop_returns_status on public.shop_returns (status, created_at desc);

create table public.shop_return_items (
  id            bigint generated always as identity primary key,
  return_id     uuid not null references public.shop_returns (id) on delete cascade,
  sale_item_id  bigint not null references public.shop_sale_items (id) on delete cascade,
  product_id    uuid references public.products (id) on delete set null,
  sku           text not null,
  name          text not null,
  qty           int not null check (qty > 0),
  price         numeric(10, 2) not null,
  cost          numeric(10, 2) not null default 0,
  amount        numeric(12, 2) not null
);
create index shop_return_items_return on public.shop_return_items (return_id);

do $$
declare t text;
begin
  foreach t in array array['shop_expenses', 'shop_returns', 'shop_return_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('create policy admin_all on public.%I for all to authenticated '
                   'using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------- sales
-- Same as before; each line also keeps the purchase rate (cost) for profit.
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
    select pr.id, pr.sku, pr.name, pr.price, coalesce(sp.purchase_rate, 0) as cost into prod
      from public.products pr left join public.shop_products sp on sp.product_id = pr.id
     where pr.id = v_pid;
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

    insert into public.shop_sale_items (sale_id, product_id, sku, name, qty, price, line_total, cost)
    values (v_sale.id, v_pid, prod.sku, prod.name, v_qty, v_price, v_qty * v_price, prod.cost);
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

-- ---------------------------------------------------------------------------------------------- returns
-- Ask to take pieces back (kind 'return', items: [{sale_item_id, qty}]) or to cancel the whole bill
-- (kind 'cancel'). Nothing changes in stock until the request is approved.
-- p: {sale_id, kind, reason?, location_id?, items?}
create or replace function public.shop_request_return(p jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_sale public.shop_sales;
  v_kind text := coalesce(nullif(p->>'kind', ''), 'return');
  v_ret public.shop_returns;
  it jsonb;
  si public.shop_sale_items;
  v_qty int;
  v_sub numeric := 0;
  n int := 0;
begin
  perform public.shop_require_admin();
  if v_kind not in ('return', 'cancel') then raise exception 'Unknown request.'; end if;
  select * into v_sale from public.shop_sales where id = nullif(p->>'sale_id', '')::uuid for update;
  if not found then raise exception 'Bill not found.'; end if;
  if v_sale.status = 'cancelled' then raise exception 'This bill is already cancelled.'; end if;
  if exists (select 1 from public.shop_returns where sale_id = v_sale.id and status = 'pending') then
    raise exception 'This bill already has a request waiting for approval.';
  end if;
  if v_kind = 'cancel' and exists (select 1 from public.shop_sale_items where sale_id = v_sale.id and returned_qty > 0) then
    raise exception 'Some pieces of this bill were already returned. Return the other pieces instead of cancelling.';
  end if;

  insert into public.shop_returns (sale_id, kind, reason, location_id)
  values (v_sale.id, v_kind, left(trim(coalesce(p->>'reason', '')), 300), nullif(p->>'location_id', '')::uuid)
  returning * into v_ret;

  if v_kind = 'cancel' then
    insert into public.shop_return_items (return_id, sale_item_id, product_id, sku, name, qty, price, cost, amount)
    select v_ret.id, i.id, i.product_id, i.sku, i.name, i.qty, i.price, i.cost, i.line_total
      from public.shop_sale_items i where i.sale_id = v_sale.id;
    update public.shop_returns set amount = v_sale.total where id = v_ret.id;
  else
    for it in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
      v_qty := coalesce(nullif(it->>'qty', '')::int, 0);
      continue when v_qty = 0;
      if v_qty < 0 then raise exception 'Quantity cannot be negative.'; end if;
      select * into si from public.shop_sale_items where id = (it->>'sale_item_id')::bigint and sale_id = v_sale.id;
      if not found then raise exception 'That item is not on this bill.'; end if;
      if v_qty > si.qty - si.returned_qty then
        raise exception 'Only % of % can be returned.', si.qty - si.returned_qty, si.sku;
      end if;
      insert into public.shop_return_items (return_id, sale_item_id, product_id, sku, name, qty, price, cost, amount)
      values (v_ret.id, si.id, si.product_id, si.sku, si.name, v_qty, si.price, si.cost, v_qty * si.price);
      v_sub := v_sub + v_qty * si.price;
      n := n + 1;
    end loop;
    if n = 0 then raise exception 'Choose at least one piece to return.'; end if;
    -- Money back: the pieces' share of the bill after its discount.
    update public.shop_returns
       set amount = case when v_sale.subtotal > 0 then round(v_sub * v_sale.total / v_sale.subtotal, 2) else 0 end
     where id = v_ret.id;
  end if;
  return jsonb_build_object('id', v_ret.id, 'number', v_ret.number);
end;
$$;

-- Approve (pieces go back into stock) or reject a return / cancellation request.
create or replace function public.shop_decide_return(p_return uuid, p_approve boolean, p_note text default '')
returns void
language plpgsql
as $$
declare
  r public.shop_returns;
  v_sale public.shop_sales;
  ri record;
  v_loc uuid;
begin
  perform public.shop_require_admin();
  select * into r from public.shop_returns where id = p_return for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.status <> 'pending' then raise exception 'This request was already %.', r.status; end if;

  if p_approve then
    select * into v_sale from public.shop_sales where id = r.sale_id for update;
    if r.kind = 'cancel' then
      perform public.shop_cancel_sale(r.sale_id);
    else
      if v_sale.status = 'cancelled' then raise exception 'The bill was cancelled.'; end if;
      for ri in select * from public.shop_return_items where return_id = r.id order by id loop
        update public.shop_sale_items set returned_qty = returned_qty + ri.qty
         where id = ri.sale_item_id and returned_qty + ri.qty <= qty;
        if not found then raise exception 'Too many pieces of % returned.', ri.sku; end if;
        continue when ri.product_id is null;   -- the product was deleted
        v_loc := coalesce(
          r.location_id,
          (select m.location_id from public.shop_stock_moves m
            where m.reason = 'sale' and m.ref = v_sale.number and m.product_id = ri.product_id and m.location_id is not null
            order by m.change, m.id limit 1),
          v_sale.location_id,
          (select l.id from public.shop_locations l where l.is_active order by l.name, l.id limit 1));
        if v_loc is null then raise exception 'Add a shop location first.'; end if;
        insert into public.shop_stock (product_id, location_id, qty) values (ri.product_id, v_loc, ri.qty)
        on conflict (product_id, location_id) do update set qty = public.shop_stock.qty + excluded.qty;
        insert into public.shop_stock_moves (product_id, location_id, change, reason, ref, note)
        values (ri.product_id, v_loc, ri.qty, 'return', r.number, v_sale.number);
      end loop;
    end if;
  end if;

  update public.shop_returns
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = left(trim(coalesce(p_note, '')), 300)
   where id = r.id;
end;
$$;

-- ---------------------------------------------------------------------------------------------- reports
-- Sales, cost, profit and expenses per day ('day'), per month ('month') or for the whole range ('total').
--   sales       = bills after discount (cancelled bills not counted)
--   returns     = money given back for approved returns (on the day they were approved)
--   net_sales   = sales - returns
--   cost        = purchase rate of the pieces sold, less returned pieces
--   gross_profit= net_sales - cost              (profit without expenses)
--   expenses    = shop expenses
--   net_profit  = gross_profit - expenses       (profit with expenses; negative = loss)
--   purchases   = stock added in the period at purchase rate (not deducted: it becomes cost when sold)
create or replace function public.shop_report(p_from date, p_to date, p_by text default 'day')
returns jsonb
language plpgsql
stable
as $$
declare out jsonb;
begin
  perform public.shop_require_admin();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a from and to date.'; end if;
  if p_by not in ('day', 'month', 'total') then raise exception 'Unknown report.'; end if;
  if p_by = 'day' and p_to - p_from > 400 then raise exception 'Day-wise report: choose up to 400 days.'; end if;
  if p_to - p_from > 3700 then raise exception 'Choose up to 10 years.'; end if;

  with periods as (
    select g::date as k
      from generate_series(case p_by when 'month' then date_trunc('month', p_from) else p_from end::timestamp,
                           case p_by when 'total' then p_from else p_to end::timestamp,
                           case p_by when 'month' then interval '1 month' else interval '1 day' end) g
  ),
  sales as (
    select (s.created_at at time zone 'Asia/Kolkata')::date as d, s.id, s.subtotal, s.discount, s.total
      from public.shop_sales s
     where s.status = 'paid'
       and s.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and s.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
  ),
  sale_k as (
    select case p_by when 'month' then date_trunc('month', d)::date when 'total' then p_from else d end as k,
           count(*) as bills, sum(subtotal) as gross, sum(discount) as discount, sum(total) as sales
      from sales group by 1
  ),
  item_k as (
    select case p_by when 'month' then date_trunc('month', s.d)::date when 'total' then p_from else s.d end as k,
           sum(i.qty) as items, sum(i.qty * i.cost) as cost
      from sales s join public.shop_sale_items i on i.sale_id = s.id
     group by 1
  ),
  ret as (
    select (r.decided_at at time zone 'Asia/Kolkata')::date as d, r.id, r.amount
      from public.shop_returns r
     where r.kind = 'return' and r.status = 'approved'
       and r.decided_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and r.decided_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
  ),
  ret_k as (
    select case p_by when 'month' then date_trunc('month', r.d)::date when 'total' then p_from else r.d end as k,
           sum(r.amount) as returns,
           sum((select coalesce(sum(ri.qty), 0) from public.shop_return_items ri where ri.return_id = r.id)) as returned_items,
           sum((select coalesce(sum(ri.qty * ri.cost), 0) from public.shop_return_items ri where ri.return_id = r.id)) as return_cost
      from ret r group by 1
  ),
  exp_k as (
    select case p_by when 'month' then date_trunc('month', e.spent_on)::date when 'total' then p_from else e.spent_on end as k,
           sum(e.amount) as expenses
      from public.shop_expenses e
     where e.spent_on between p_from and p_to
     group by 1
  ),
  buy_k as (
    select case p_by when 'month' then date_trunc('month', d)::date when 'total' then p_from else d end as k,
           sum(amount) as purchases
      from (select (m.created_at at time zone 'Asia/Kolkata')::date as d, m.change * coalesce(sp.purchase_rate, 0) as amount
              from public.shop_stock_moves m
              left join public.shop_products sp on sp.product_id = m.product_id
             where m.reason = 'opening'
               and m.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
               and m.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')) x
     group by 1
  ),
  all_rows as (
    select p.k,
           coalesce(s.bills, 0) as bills, coalesce(i.items, 0) as items,
           coalesce(s.gross, 0) as gross, coalesce(s.discount, 0) as discount, coalesce(s.sales, 0) as sales,
           coalesce(r.returns, 0) as returns, coalesce(r.returned_items, 0) as returned_items,
           coalesce(i.cost, 0) - coalesce(r.return_cost, 0) as cost,
           coalesce(e.expenses, 0) as expenses, coalesce(b.purchases, 0) as purchases
      from periods p
      left join sale_k s on s.k = p.k
      left join item_k i on i.k = p.k
      left join ret_k r on r.k = p.k
      left join exp_k e on e.k = p.k
      left join buy_k b on b.k = p.k
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'period', k, 'bills', bills, 'items', items, 'gross', gross, 'discount', discount, 'sales', sales,
           'returns', returns, 'returned_items', returned_items, 'net_sales', sales - returns, 'cost', cost,
           'gross_profit', sales - returns - cost, 'expenses', expenses,
           'net_profit', sales - returns - cost - expenses, 'purchases', purchases) order by k), '[]'::jsonb)
    into out
    from all_rows;
  return out;
end;
$$;

-- What sold in a date range: by category, payment method, product (top 25) and expense type.
-- Pieces returned later are left out of the item figures.
create or replace function public.shop_breakdown(p_from date, p_to date)
returns jsonb
language plpgsql
stable
as $$
declare out jsonb;
begin
  perform public.shop_require_admin();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a from and to date.'; end if;
  with sales as (
    select s.* from public.shop_sales s
     where s.status = 'paid'
       and s.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and s.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
  ),
  lines as (
    select i.product_id, i.sku, i.name, s.id as sale_id,
           i.qty - i.returned_qty as qty,
           (i.qty - i.returned_qty) * i.price * case when s.subtotal > 0 then s.total / s.subtotal else 0 end as amount,
           (i.qty - i.returned_qty) * i.cost as cost
      from sales s join public.shop_sale_items i on i.sale_id = s.id
  )
  select jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(x order by x.amount desc), '[]'::jsonb) from (
       select coalesce(c.name, 'No category') as name, sum(l.qty) as items, round(sum(l.amount), 2) as amount,
              round(sum(l.cost), 2) as cost, round(sum(l.amount - l.cost), 2) as profit
         from lines l left join public.products p on p.id = l.product_id left join public.categories c on c.id = p.category_id
        group by 1) x),
    'payments', (select coalesce(jsonb_agg(x order by x.amount desc), '[]'::jsonb) from (
       select payment_method as name, count(*) as bills, sum(total) as amount from sales group by 1) x),
    'products', (select coalesce(jsonb_agg(x order by x.amount desc), '[]'::jsonb) from (
       select l.product_id as id, max(l.sku) as sku, max(l.name) as name, sum(l.qty) as items,
              round(sum(l.amount), 2) as amount, round(sum(l.amount - l.cost), 2) as profit
         from lines l where l.qty > 0 group by l.product_id order by sum(l.amount) desc limit 25) x),
    'expenses', (select coalesce(jsonb_agg(x order by x.amount desc), '[]'::jsonb) from (
       select category as name, count(*) as count, sum(amount) as amount
         from public.shop_expenses where spent_on between p_from and p_to group by 1) x)
  ) into out;
  return out;
end;
$$;

-- How each vendor's pieces are selling: sold in the range (after returns), profit, and stock left now.
create or replace function public.shop_vendor_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
as $$
declare out jsonb;
begin
  perform public.shop_require_admin();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a from and to date.'; end if;
  with sold as (
    select sp.vendor_id, count(distinct s.id) as bills,
           sum(i.qty - i.returned_qty) as items, sum(i.returned_qty) as returned,
           sum((i.qty - i.returned_qty) * i.price * case when s.subtotal > 0 then s.total / s.subtotal else 0 end) as amount,
           sum((i.qty - i.returned_qty) * i.cost) as cost,
           count(distinct i.product_id) filter (where i.qty > i.returned_qty) as designs
      from public.shop_sales s
      join public.shop_sale_items i on i.sale_id = s.id
      left join public.shop_products sp on sp.product_id = i.product_id
     where s.status = 'paid'
       and s.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and s.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
     group by sp.vendor_id
  ),
  stock as (
    select sp.vendor_id, count(*) filter (where p.stock_qty > 0) as products, sum(p.stock_qty) as pieces,
           sum(p.stock_qty * sp.purchase_rate) as stock_cost, sum(p.stock_qty * p.price) as stock_value
      from public.shop_products sp join public.products p on p.id = sp.product_id
     where p.is_active
     group by sp.vendor_id
  ),
  keys as (select vendor_id from sold union select vendor_id from stock)
  select coalesce(jsonb_agg(x order by x.amount desc, x.name), '[]'::jsonb) into out
    from (
      select k.vendor_id as id, coalesce(v.name, 'No vendor') as name, v.code_no, l.name as city,
             coalesce(s.bills, 0) as bills, coalesce(s.items, 0) as items, coalesce(s.returned, 0) as returned,
             coalesce(s.designs, 0) as designs,
             round(coalesce(s.amount, 0), 2) as amount, round(coalesce(s.cost, 0), 2) as cost,
             round(coalesce(s.amount, 0) - coalesce(s.cost, 0), 2) as profit,
             coalesce(st.products, 0) as stock_products, coalesce(st.pieces, 0) as stock_pieces,
             round(coalesce(st.stock_cost, 0), 2) as stock_cost, round(coalesce(st.stock_value, 0), 2) as stock_value
        from keys k
        left join sold s on s.vendor_id is not distinct from k.vendor_id
        left join stock st on st.vendor_id is not distinct from k.vendor_id
        left join public.shop_vendors v on v.id = k.vendor_id
        left join public.shop_locations l on l.id = v.location_id
    ) x;
  return out;
end;
$$;

-- ---------------------------------------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array['shop_create_sale(jsonb)', 'shop_request_return(jsonb)', 'shop_decide_return(uuid, boolean, text)',
                           'shop_report(date, date, text)', 'shop_breakdown(date, date)', 'shop_vendor_report(date, date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
