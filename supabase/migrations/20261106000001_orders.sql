-- Online orders and payments (same model as the WOW3D store: the database prices every order, the browser
-- never sends prices, and payment methods are switched on by the admin).
--
-- Payment methods:
--   razorpay    cards, UPI apps, netbanking through Razorpay. Marked paid only by the website server after it
--               checked Razorpay's signature (functions below are callable with the service_role key only).
--   upi_manual  customer pays the shop's UPI ID; the admin marks the order paid.
--   cod         cash on delivery; the admin marks it paid when the cash comes in.
--
-- Stock: placing an order takes the pieces out of stock straight away (from the shop location that has the
-- most), so two customers can't buy the same last piece. Cancelling puts them back. A Razorpay order that is
-- not paid within 60 minutes is cancelled automatically and its stock is released.

create type public.order_status as enum ('placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled');
create type public.payment_method as enum ('razorpay', 'upi_manual', 'cod');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

-- ---------------------------------------------------------------------------------------------- settings
alter table public.store_settings
  add column orders_open          boolean not null default true,
  add column razorpay_enabled     boolean not null default false,
  add column upi_manual_enabled   boolean not null default false,
  add column cod_enabled          boolean not null default false,
  add column upi_id               text not null default '',
  add column shipping_fee         numeric(10, 2) not null default 0 check (shipping_fee >= 0),
  add column free_shipping_above  numeric(10, 2) not null default 0 check (free_shipping_above >= 0);

-- ---------------------------------------------------------------------------------------------- addresses
create table public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  full_name   text not null check (length(trim(full_name)) between 2 and 80),
  phone       text not null check (phone ~ '^[6-9][0-9]{9}$'),
  line1       text not null check (length(trim(line1)) between 3 and 200),
  line2       text not null default '' check (length(line2) <= 200),
  city        text not null check (length(trim(city)) between 2 and 80),
  state       text not null check (length(trim(state)) between 2 and 60),
  pincode     text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  created_at  timestamptz not null default now()
);
create index addresses_user on public.addresses (user_id, created_at desc);

-- ---------------------------------------------------------------------------------------------- orders
create sequence public.order_number_seq start 1001;

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  number            text not null unique default ('ABH-' || nextval('public.order_number_seq')),
  user_id           uuid not null references auth.users (id),
  email             text not null default '',
  status            public.order_status not null default 'placed',
  payment_method    public.payment_method not null,
  payment_status    public.payment_status not null default 'pending',
  subtotal          numeric(12, 2) not null,
  shipping_fee      numeric(10, 2) not null default 0,
  total             numeric(12, 2) not null check (total > 0),
  shipping_address  jsonb not null,               -- copy of the address at order time
  customer_notes    text not null default '',
  admin_note        text not null default '',     -- admin only (see column grants below)
  tracking          text not null default '',     -- courier and tracking number, shown to the customer
  pay_token         uuid not null default gen_random_uuid(),  -- lets the app open the payment page
  gateway_order_id  text unique,                  -- Razorpay order id
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index orders_user on public.orders (user_id, created_at desc);
create index orders_status on public.orders (status, created_at desc);
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

create table public.order_items (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  product_id  uuid references public.products (id) on delete set null,
  sku         text not null,
  name        text not null,
  image_path  text,
  price       numeric(10, 2) not null,
  quantity    int not null check (quantity between 1 and 50),
  line_total  numeric(12, 2) generated always as (price * quantity) stored,
  stock_from  jsonb not null default '[]'        -- [{location_id, qty}] taken from stock, to put back on cancel
);
create index order_items_order on public.order_items (order_id);

create table public.order_status_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  status      public.order_status not null,
  note        text not null default '',
  created_at  timestamptz not null default now()
);
create index order_status_history_order on public.order_status_history (order_id, created_at);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete cascade,
  method              public.payment_method not null,
  gateway_payment_id  text unique,
  amount              numeric(12, 2) not null,
  status              public.payment_status not null,
  note                text not null default '',
  raw                 jsonb,
  created_at          timestamptz not null default now()
);
create index payments_order on public.payments (order_id);

create or replace function public.log_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history (order_id, status) values (new.id, new.status);
  end if;
  return new;
end;
$$;
create trigger orders_log_status after insert or update of status on public.orders
  for each row execute function public.log_order_status();

-- ---------------------------------------------------------------------------------------------- security
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;

revoke all on public.addresses, public.orders, public.order_items, public.order_status_history, public.payments from anon;

create policy own_all on public.addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy admin_all on public.addresses for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Customers read their own orders; they never write them directly (place_order / cancel_my_order do that).
create policy own_select on public.orders for select to authenticated using (user_id = auth.uid());
create policy own_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy own_select on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy own_select on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['orders', 'order_items', 'order_status_history', 'payments'] loop
    execute format('create policy admin_all on public.%I for all to authenticated '
                   'using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- The admin's private note is not readable by customers (column-level: everything except admin_note).
revoke select on public.orders from authenticated;
grant select (id, number, user_id, email, status, payment_method, payment_status, subtotal, shipping_fee, total,
              shipping_address, customer_notes, tracking, pay_token, gateway_order_id, paid_at, created_at, updated_at)
  on public.orders to authenticated;
-- Admins read the note through this function.
create or replace function public.order_admin_note(p_order uuid)
returns text language sql stable security definer set search_path = public as $$
  select o.admin_note from public.orders o where o.id = p_order and public.is_admin();
$$;

-- Online stock movements are kept with the shop's other stock movements.
alter table public.shop_stock_moves drop constraint shop_stock_moves_reason_check;
alter table public.shop_stock_moves add constraint shop_stock_moves_reason_check
  check (reason in ('opening', 'adjust', 'sale', 'cancel', 'import', 'online', 'online_cancel'));

-- ---------------------------------------------------------------------------------------------- stock helpers
-- Take qty pieces of a product out of stock (largest shop location first). Returns [{location_id, qty}].
create or replace function public.order_take_stock(p_product uuid, p_qty int, p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  need int := p_qty;
  r record;
  took int;
  taken jsonb := '[]';
  have int;
begin
  if exists (select 1 from public.shop_stock where product_id = p_product) then
    select coalesce(sum(qty), 0) into have from public.shop_stock where product_id = p_product;
    if have < p_qty then
      return null;
    end if;
    for r in select location_id, qty from public.shop_stock
              where product_id = p_product and qty > 0 order by qty desc, location_id for update loop
      exit when need = 0;
      took := least(r.qty, need);
      update public.shop_stock set qty = qty - took where product_id = p_product and location_id = r.location_id;
      insert into public.shop_stock_moves (product_id, location_id, change, reason, ref, created_by)
      values (p_product, r.location_id, -took, 'online', p_ref, null);
      taken := taken || jsonb_build_object('location_id', r.location_id, 'qty', took);
      need := need - took;
    end loop;
  else
    -- Product without per-location stock: use the website stock number.
    update public.products set stock_qty = stock_qty - p_qty where id = p_product and stock_qty >= p_qty;
    if not found then
      return null;
    end if;
    taken := jsonb_build_array(jsonb_build_object('location_id', null, 'qty', p_qty));
  end if;
  return taken;
end;
$$;

-- Put an order's pieces back into stock (cancel).
create or replace function public.order_return_stock(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  it record;
  part jsonb;
  v_number text;
begin
  select number into v_number from public.orders where id = p_order;
  for it in select id, product_id, stock_from from public.order_items where order_id = p_order and product_id is not null loop
    for part in select * from jsonb_array_elements(it.stock_from) loop
      if part->>'location_id' is null then
        update public.products set stock_qty = stock_qty + (part->>'qty')::int where id = it.product_id;
      else
        insert into public.shop_stock (product_id, location_id, qty)
        values (it.product_id, (part->>'location_id')::uuid, (part->>'qty')::int)
        on conflict (product_id, location_id) do update set qty = public.shop_stock.qty + excluded.qty;
        insert into public.shop_stock_moves (product_id, location_id, change, reason, ref, created_by)
        values (it.product_id, (part->>'location_id')::uuid, (part->>'qty')::int, 'online_cancel', v_number, null);
      end if;
    end loop;
    update public.order_items set stock_from = '[]' where id = it.id;
  end loop;
end;
$$;

-- Unpaid online-payment orders older than 60 minutes are cancelled and their stock released.
create or replace function public.release_unpaid_orders()
returns int language plpgsql security definer set search_path = public as $$
declare
  o record;
  n int := 0;
begin
  for o in select id from public.orders
            where payment_method = 'razorpay' and payment_status = 'pending' and status = 'placed'
              and created_at < now() - interval '60 minutes'
            for update skip locked loop
    perform public.order_return_stock(o.id);
    update public.orders set status = 'cancelled', payment_status = 'failed' where id = o.id;
    insert into public.order_status_history (order_id, status, note) values (o.id, 'cancelled', 'Not paid within 60 minutes');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------------------------- placing
-- p_items: [{product_id, quantity}]. Prices, shipping and stock come from the database.
create or replace function public.place_order(
  p_items jsonb, p_address_id uuid, p_method public.payment_method, p_notes text default ''
) returns table (id uuid, number text, total numeric, pay_token uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  s public.store_settings;
  v_addr public.addresses;
  v_order public.orders;
  v_item jsonb;
  v_qty int;
  p record;
  v_taken jsonb;
  v_sub numeric := 0;
  v_ship numeric := 0;
  v_recent int;
begin
  if v_user is null then
    raise exception 'Please log in to place an order.';
  end if;
  select * into s from public.store_settings where store_settings.id = 1;
  if not s.orders_open then
    raise exception 'We are not taking online orders right now. Please send an enquiry or WhatsApp us.';
  end if;
  if (p_method = 'razorpay' and not s.razorpay_enabled) or (p_method = 'upi_manual' and not s.upi_manual_enabled)
     or (p_method = 'cod' and not s.cod_enabled) then
    raise exception 'This payment option is not available. Please choose another one.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your bag is empty.';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'An order can have at most 30 different pieces.';
  end if;
  select * into v_addr from public.addresses a where a.id = p_address_id and a.user_id = v_user;
  if not found then
    raise exception 'Please choose a delivery address.';
  end if;
  select count(*) into v_recent from public.orders o
   where o.user_id = v_user and o.created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'Too many orders in the last hour. Please wait a while or WhatsApp us.';
  end if;

  perform public.release_unpaid_orders();

  insert into public.orders (user_id, email, payment_method, subtotal, total, shipping_address, customer_notes)
  values (v_user, coalesce((select u.email from auth.users u where u.id = v_user), ''), p_method, 0, 1,
          jsonb_build_object('full_name', v_addr.full_name, 'phone', v_addr.phone, 'line1', v_addr.line1,
                             'line2', v_addr.line2, 'city', v_addr.city, 'state', v_addr.state, 'pincode', v_addr.pincode),
          left(trim(coalesce(p_notes, '')), 500))
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::int, 1);
    if v_qty < 1 or v_qty > 50 then
      raise exception 'Quantity must be between 1 and 50.';
    end if;
    select c.id, c.sku, c.name, c.price, c.image_paths into p
      from public.catalog c where c.id = (v_item ->> 'product_id')::uuid;
    if not found then
      raise exception 'A piece in your bag is no longer available. Please remove it and try again.';
    end if;
    if exists (select 1 from public.order_items oi where oi.order_id = v_order.id and oi.product_id = p.id) then
      raise exception 'The same piece is in your bag twice.';
    end if;
    v_taken := public.order_take_stock(p.id, v_qty, v_order.number);
    if v_taken is null then
      raise exception '% (%) is sold out or has fewer pieces left than you chose.', p.name, p.sku;
    end if;
    insert into public.order_items (order_id, product_id, sku, name, image_path, price, quantity, stock_from)
    values (v_order.id, p.id, p.sku, p.name, p.image_paths[1], p.price, v_qty, v_taken);
    v_sub := v_sub + p.price * v_qty;
  end loop;

  if v_sub <= 0 then
    raise exception 'This order has no price. Please send an enquiry instead.';
  end if;
  if not (s.free_shipping_above > 0 and v_sub >= s.free_shipping_above) then
    v_ship := s.shipping_fee;
  end if;
  update public.orders o set subtotal = v_sub, shipping_fee = v_ship, total = v_sub + v_ship
   where o.id = v_order.id;

  return query select v_order.id, v_order.number, v_sub + v_ship, v_order.pay_token;
end;
$$;

-- Customers may cancel an order that is not paid and not yet confirmed by the shop.
create or replace function public.cancel_my_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order and user_id = auth.uid() for update;
  if not found or o.status <> 'placed' or o.payment_status = 'paid' then
    raise exception 'This order can no longer be cancelled here. Please call or WhatsApp us.';
  end if;
  perform public.order_return_stock(o.id);
  update public.orders set status = 'cancelled',
         payment_status = case when payment_status = 'pending' then 'failed'::public.payment_status else payment_status end
   where id = o.id;
end;
$$;

-- ---------------------------------------------------------------------------------------------- admin
create or replace function public.admin_update_order(
  p_order uuid, p_status public.order_status default null, p_payment public.payment_status default null,
  p_tracking text default null, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if not public.is_admin() then
    raise exception 'Only the shop admin can do this.' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found.'; end if;

  if p_status is not null and p_status <> o.status then
    if o.status = 'cancelled' then
      raise exception 'A cancelled order cannot be opened again. Ask the customer to order again.';
    end if;
    if p_status = 'cancelled' then
      perform public.order_return_stock(o.id);
    end if;
    update public.orders set status = p_status where id = o.id;
  end if;

  if p_payment is not null and p_payment <> o.payment_status then
    update public.orders set payment_status = p_payment,
           paid_at = case when p_payment = 'paid' then coalesce(paid_at, now()) else paid_at end
     where id = o.id;
    insert into public.payments (order_id, method, amount, status, note)
    values (o.id, o.payment_method, o.total, p_payment, 'Changed by admin');
  end if;

  if p_tracking is not null then
    update public.orders set tracking = left(trim(p_tracking), 200) where id = o.id;
  end if;
  if p_note is not null then
    update public.orders set admin_note = left(p_note, 2000) where id = o.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------- Razorpay
-- Only the website server (service_role key) calls these, after it checked Razorpay's signature.

-- The payment page: order details for the owner of the pay link.
create or replace function public.order_for_payment(p_order uuid, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  perform public.release_unpaid_orders();
  select * into o from public.orders where id = p_order and pay_token = p_token;
  if not found then return null; end if;
  return jsonb_build_object('id', o.id, 'number', o.number, 'total', o.total, 'status', o.status,
    'payment_method', o.payment_method, 'payment_status', o.payment_status, 'gateway_order_id', o.gateway_order_id,
    'email', o.email, 'name', o.shipping_address->>'full_name', 'phone', o.shipping_address->>'phone',
    'created_at', o.created_at);
end;
$$;

create or replace function public.order_set_gateway(p_order uuid, p_token uuid, p_gateway_order text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set gateway_order_id = p_gateway_order
   where id = p_order and pay_token = p_token and payment_method = 'razorpay' and payment_status = 'pending'
     and status = 'placed';
  if not found then raise exception 'This order cannot be paid now.'; end if;
end;
$$;

-- Record a successful Razorpay payment (from the checkout or from Razorpay's webhook; safe to call twice).
-- Returns the order number, or null when the order is unknown.
create or replace function public.order_mark_paid(p_gateway_order text, p_payment_id text, p_amount_paise bigint, p_raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  it record;
  v_taken jsonb;
  ok boolean := true;
begin
  select * into o from public.orders where gateway_order_id = p_gateway_order for update;
  if not found then return null; end if;
  if exists (select 1 from public.payments where gateway_payment_id = p_payment_id) then
    return o.number;
  end if;
  insert into public.payments (order_id, method, gateway_payment_id, amount, status, raw)
  values (o.id, 'razorpay', p_payment_id, p_amount_paise / 100.0,
          case when p_amount_paise >= round(o.total * 100) then 'paid' else 'failed' end::public.payment_status, p_raw);
  if p_amount_paise < round(o.total * 100) then
    return o.number;   -- paid less than the order total: the admin sees the payment and decides
  end if;

  if o.status = 'cancelled' then
    -- Paid after the order timed out: take the stock again if it is still there.
    for it in select id, product_id, quantity from public.order_items where order_id = o.id and product_id is not null loop
      v_taken := public.order_take_stock(it.product_id, it.quantity, o.number);
      if v_taken is null then
        ok := false;
      else
        update public.order_items set stock_from = v_taken where id = it.id;
      end if;
    end loop;
    if ok then
      update public.orders set status = 'placed' where id = o.id;
    else
      update public.orders set admin_note = trim(admin_note || E'\nPaid after the order was cancelled and some pieces are sold out: refund or offer another design.')
       where id = o.id;
    end if;
  end if;
  update public.orders set payment_status = 'paid', paid_at = now() where id = o.id;
  return o.number;
end;
$$;

-- ---------------------------------------------------------------------------------------------- grants
revoke all on function public.order_take_stock(uuid, int, text) from public, anon, authenticated;
revoke all on function public.order_return_stock(uuid) from public, anon, authenticated;
revoke all on function public.release_unpaid_orders() from public, anon, authenticated;
revoke all on function public.place_order(jsonb, uuid, public.payment_method, text) from public, anon;
revoke all on function public.cancel_my_order(uuid) from public, anon;
revoke all on function public.admin_update_order(uuid, public.order_status, public.payment_status, text, text) from public, anon;
revoke all on function public.order_admin_note(uuid) from public, anon;
revoke all on function public.order_for_payment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.order_set_gateway(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.order_mark_paid(text, text, bigint, jsonb) from public, anon, authenticated;

grant execute on function public.place_order(jsonb, uuid, public.payment_method, text) to authenticated;
grant execute on function public.cancel_my_order(uuid) to authenticated;
grant execute on function public.admin_update_order(uuid, public.order_status, public.payment_status, text, text) to authenticated;
grant execute on function public.order_admin_note(uuid) to authenticated;
grant execute on function public.order_for_payment(uuid, uuid) to service_role;
grant execute on function public.order_set_gateway(uuid, uuid, text) to service_role;
grant execute on function public.order_mark_paid(text, text, bigint, jsonb) to service_role;
grant execute on function public.release_unpaid_orders() to service_role;
