begin;
select plan(31);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'buyer@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'other@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'boss@test.local');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000c3';
update public.store_settings set razorpay_enabled = true, cod_enabled = true, shipping_fee = 80, free_shipping_above = 5000;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.pid(local text) returns uuid language sql as $$
  select id from public.products where local_id = local;
$$;

-- A product with stock in two shop locations, and one with only a website stock number.
insert into public.shop_locations (id, name) values ('40000000-0000-0000-0000-000000000001', 'Hyderabad'),
                                                    ('40000000-0000-0000-0000-000000000002', 'Bangalore');
insert into public.shop_stock (product_id, location_id, qty) values
  (pg_temp.pid('DEMO-PRD-0010'), '40000000-0000-0000-0000-000000000001', 1),
  (pg_temp.pid('DEMO-PRD-0010'), '40000000-0000-0000-0000-000000000002', 2);
update public.products set stock_qty = 1, price = 1000 where local_id = 'DEMO-PRD-0011';
update public.products set price = 1500 where local_id = 'DEMO-PRD-0010';

create temp table t (k text primary key, v jsonb);
grant all on t to authenticated, service_role;

-- Visitors ------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select count(*) from public.orders $$, '42501', null, 'visitor cannot read orders');
select throws_ok($$ select * from public.place_order('[]', null, 'cod') $$, '42501', null, 'visitor cannot place orders');
reset role;

-- Buyer ---------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
insert into public.addresses (id, full_name, phone, line1, city, state, pincode)
values ('50000000-0000-0000-0000-000000000001', 'Asha', '9876543210', '12 Temple Street', 'Nandyal', 'Andhra Pradesh', '518501');
select throws_ok($$ insert into public.addresses (full_name, phone, line1, city, state, pincode)
  values ('Asha', '12345', '12 Temple Street', 'Nandyal', 'AP', '518501') $$, '23514', null, 'bad mobile number refused');

insert into t select 'cod', to_jsonb(r) from public.place_order(
  jsonb_build_array(jsonb_build_object('product_id', pg_temp.pid('DEMO-PRD-0010'), 'quantity', 2, 'price', 1),
                    jsonb_build_object('product_id', pg_temp.pid('DEMO-PRD-0011'), 'quantity', 1)),
  '50000000-0000-0000-0000-000000000001', 'cod', 'Gift wrap please') r;
select matches((select v->>'number' from t where k = 'cod'), '^ABH-\d+$', 'order number');
select is((select (v->>'total')::numeric from t where k = 'cod'), 4000::numeric + 80, 'prices from the database plus shipping');
select is((select stock_qty from public.products where local_id = 'DEMO-PRD-0010'), 1, 'stock taken from shop locations');
reset role;
select is((select qty from public.shop_stock where product_id = pg_temp.pid('DEMO-PRD-0010')
            and location_id = '40000000-0000-0000-0000-000000000002'), 0, 'largest location first');
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select is((select stock_qty from public.products where local_id = 'DEMO-PRD-0011'), 0, 'website stock number taken');
select throws_like($$ select * from public.place_order(
  jsonb_build_array(jsonb_build_object('product_id', pg_temp.pid('DEMO-PRD-0011'), 'quantity', 1)),
  '50000000-0000-0000-0000-000000000001', 'cod') $$, '%sold out%', 'cannot buy a sold-out piece');
select throws_like($$ select * from public.place_order(
  jsonb_build_array(jsonb_build_object('product_id', pg_temp.pid('DEMO-PRD-0010'), 'quantity', 1)),
  '50000000-0000-0000-0000-000000000001', 'upi_manual') $$, '%not available%', 'payment option must be switched on');
select is((select count(*)::int from public.orders), 1, 'buyer sees own order');
select throws_ok($$ select admin_note from public.orders $$, '42501', null, 'admin note hidden from the customer');
select is_empty($$ update public.orders set payment_status = 'paid' returning id $$, 'customer cannot mark paid');
select throws_ok($$ select public.order_mark_paid('x', 'y', 1, '{}') $$, '42501', null, 'customer cannot call payment functions');

-- Cancel puts stock back.
select lives_ok(format($$ select public.cancel_my_order(%L) $$, (select v->>'id' from t where k = 'cod')), 'customer cancels');
select is((select stock_qty from public.products where local_id = 'DEMO-PRD-0010'), 3, 'stock back after cancel');
select is((select stock_qty from public.products where local_id = 'DEMO-PRD-0011'), 1, 'website stock back after cancel');

-- Razorpay order: paid through the server (service_role) only.
insert into t select 'rzp', to_jsonb(r) from public.place_order(
  jsonb_build_array(jsonb_build_object('product_id', pg_temp.pid('DEMO-PRD-0010'), 'quantity', 3)),
  '50000000-0000-0000-0000-000000000001', 'razorpay') r;
reset role;

set local role service_role;
select lives_ok(format($$ select public.order_set_gateway(%L, %L, 'order_TEST1') $$,
  (select v->>'id' from t where k = 'rzp'), (select v->>'pay_token' from t where k = 'rzp')), 'server links the Razorpay order');
select throws_like(format($$ select public.order_set_gateway(%L, gen_random_uuid(), 'order_X') $$,
  (select v->>'id' from t where k = 'rzp')), '%cannot be paid%', 'wrong pay link refused');
select is(public.order_mark_paid('order_TEST1', 'pay_1', 100, '{}'), (select v->>'number' from t where k = 'rzp'), 'short payment recorded');
reset role;
select is((select payment_status::text from public.orders where id = (select (v->>'id')::uuid from t where k = 'rzp')), 'pending', 'short payment does not mark paid');
set local role service_role;
select is(public.order_mark_paid('order_TEST1', 'pay_2', 458000, '{}'), (select v->>'number' from t where k = 'rzp'), 'full payment');
select is(public.order_mark_paid('order_TEST1', 'pay_2', 458000, '{}'), (select v->>'number' from t where k = 'rzp'), 'same payment twice is fine');
reset role;
select is((select payment_status::text || '/' || (select count(*) from public.payments p where p.order_id = o.id)
             from public.orders o where id = (select (v->>'id')::uuid from t where k = 'rzp')), 'paid/2', 'marked paid once');

-- Another customer sees nothing.
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select is((select count(*)::int from public.orders) + (select count(*)::int from public.order_items), 0, 'other customer sees no orders');
select throws_ok(format($$ select public.admin_update_order(%L, 'shipped') $$, (select v->>'id' from t where k = 'rzp')),
  '42501', null, 'customer cannot change order status');
reset role;

-- Unpaid online orders are released after 60 minutes.
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
insert into t select 'late', to_jsonb(r) from public.place_order(
  jsonb_build_array(jsonb_build_object('product_id', pg_temp.pid('DEMO-PRD-0011'), 'quantity', 1)),
  '50000000-0000-0000-0000-000000000001', 'razorpay') r;
reset role;
update public.orders set created_at = now() - interval '2 hours', gateway_order_id = 'order_LATE'
 where id = (select (v->>'id')::uuid from t where k = 'late');
select is(public.release_unpaid_orders(), 1, 'one unpaid order released');
select is((select stock_qty from public.products where local_id = 'DEMO-PRD-0011'), 1, 'its stock is back');
select public.order_mark_paid('order_LATE', 'pay_late', 108000, '{}');
select is((select status::text || '/' || payment_status::text from public.orders where id = (select (v->>'id')::uuid from t where k = 'late')),
  'placed/paid', 'paid late: order comes back while the piece is still there');

-- Admin cancels: stock goes back.
select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
select lives_ok(format($$ select public.admin_update_order(%L, 'cancelled', 'refunded', null, 'Refunded by UPI') $$,
  (select v->>'id' from t where k = 'rzp')), 'admin cancels and refunds');
select is((select stock_qty from public.products where local_id = 'DEMO-PRD-0010'), 3, 'stock back after admin cancel');
reset role;

select * from finish();
rollback;
