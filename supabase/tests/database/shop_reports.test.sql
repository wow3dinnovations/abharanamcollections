begin;
select plan(32);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'cust@test.local');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
insert into public.categories (id, name, code) values ('10000000-0000-0000-0000-000000000009', 'Bangles Test', 'BT');
insert into public.shop_locations (id, name, code) values ('30000000-0000-0000-0000-000000000009', 'Hyderabad Test', 'H');
insert into public.shop_vendors (id, name, location_id, code_no) values
  ('20000000-0000-0000-0000-000000000009', 'Vendor Nine', '30000000-0000-0000-0000-000000000009', 1);
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids values ('a', public.shop_save_product(jsonb_build_object(
  'sku', 'IH1T1', 'name', 'Bangle', 'category_id', '10000000-0000-0000-0000-000000000009', 'size', '2.6',
  'vendor_id', '20000000-0000-0000-0000-000000000009',
  'location_id', '30000000-0000-0000-0000-000000000009', 'purchase_rate', 200, 'price', 500, 'opening_qty', 5)));

-- A bill of 4 at 500 with 10% off: total 1800, cost 4 x 200
create temp table bill (k text primary key, r jsonb);
grant all on bill to authenticated;
insert into bill select 'one', public.shop_create_sale(jsonb_build_object(
  'discount_type', 'percent', 'discount_value', 10,
  'items', jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k = 'a'), 'qty', 4, 'price', 500))));
select is((select cost from public.shop_sale_items where sale_id = (select (r->>'id')::uuid from bill where k = 'one')),
  200::numeric, 'bill line keeps the purchase rate');

-- Expenses
insert into public.shop_expenses (category, amount, note) values ('rent', 300, 'November'), ('electricity', 100, '');
select throws_ok($$ insert into public.shop_expenses (category, amount) values ('party', 10) $$, '23514', null,
  'unknown expense type refused');
select throws_ok($$ insert into public.shop_expenses (category, amount) values ('rent', 0) $$, '23514', null,
  'zero expense refused');

create temp table rep (k text primary key, r jsonb);
grant all on rep to authenticated;
insert into rep select 'today', public.shop_report((now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date, 'total') -> 0;
select is((select (r->>'sales')::numeric from rep where k = 'today'), 1800::numeric, 'sales after discount');
select is((select (r->>'gross')::numeric from rep where k = 'today'), 2000::numeric, 'gross sales');
select is((select (r->>'discount')::numeric from rep where k = 'today'), 200::numeric, 'discount');
select is((select (r->>'items')::int from rep where k = 'today'), 4, 'pieces sold');
select is((select (r->>'cost')::numeric from rep where k = 'today'), 800::numeric, 'cost of pieces sold');
select is((select (r->>'gross_profit')::numeric from rep where k = 'today'), 1000::numeric, 'profit without expenses');
select is((select (r->>'expenses')::numeric from rep where k = 'today'), 400::numeric, 'expenses');
select is((select (r->>'net_profit')::numeric from rep where k = 'today'), 600::numeric, 'profit with expenses');
select is((select (r->>'purchases')::numeric from rep where k = 'today'), 1000::numeric, 'stock bought: 5 x 200');

select is(jsonb_array_length(public.shop_report('2026-01-01', '2026-03-31', 'month')), 3, 'one row per month');
select is(jsonb_array_length(public.shop_report('2026-01-01', '2026-01-31', 'day')), 31, 'one row per day');
select throws_ok($$ select public.shop_report('2026-02-01', '2026-01-01', 'day') $$, 'Choose a from and to date.', 'dates the wrong way round');

-- Return 2 pieces: a request first, stock unchanged until approved
create temp table ret (k text primary key, r jsonb);
grant all on ret to authenticated;
insert into ret select 'r1', public.shop_request_return(jsonb_build_object(
  'sale_id', (select (r->>'id')::uuid from bill where k = 'one'), 'kind', 'return', 'reason', 'size',
  'items', jsonb_build_array(jsonb_build_object(
    'sale_item_id', (select id from public.shop_sale_items where sale_id = (select (r->>'id')::uuid from bill where k = 'one')),
    'qty', 2))));
select is((select stock_qty from public.products where id = (select v from ids where k = 'a')), 1, 'request alone: stock not back yet');
select is((select amount from public.shop_returns where id = (select (r->>'id')::uuid from ret where k = 'r1')), 900::numeric,
  'money back = share of the bill after discount');
select throws_ok(format($$ select public.shop_request_return(jsonb_build_object('sale_id', %L, 'kind', 'cancel')) $$,
  (select (r->>'id')::uuid from bill where k = 'one')), 'This bill already has a request waiting for approval.', 'one request at a time');
select lives_ok(format($$ select public.shop_decide_return(%L, true, 'ok') $$, (select (r->>'id')::uuid from ret where k = 'r1')),
  'approve the return');
select is((select stock_qty from public.products where id = (select v from ids where k = 'a')), 3, 'approved: 2 pieces back in stock');
select is((select returned_qty from public.shop_sale_items where sale_id = (select (r->>'id')::uuid from bill where k = 'one')), 2,
  'bill line remembers 2 returned');
select throws_like(format($$ select public.shop_decide_return(%L, true) $$, (select (r->>'id')::uuid from ret where k = 'r1')),
  'This request was already approved%', 'cannot approve twice');

delete from rep;
insert into rep select 'today', public.shop_report((now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date, 'total') -> 0;
select is((select (r->>'net_sales')::numeric from rep where k = 'today'), 900::numeric, 'net sales after the return');
select is((select (r->>'gross_profit')::numeric from rep where k = 'today'), 500::numeric, 'profit after the return');

select throws_like(format($$ select public.shop_request_return(jsonb_build_object('sale_id', %L, 'kind', 'cancel')) $$,
  (select (r->>'id')::uuid from bill where k = 'one')), 'Some pieces of this bill were already returned%', 'no cancel after a return');

-- Cancellation of a new bill: rejected keeps the bill, approved puts everything back
insert into bill select 'two', public.shop_create_sale(jsonb_build_object(
  'items', jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k = 'a'), 'qty', 1, 'price', 500))));
insert into ret select 'c1', public.shop_request_return(jsonb_build_object('sale_id', (select (r->>'id')::uuid from bill where k = 'two'), 'kind', 'cancel'));
select lives_ok(format($$ select public.shop_decide_return(%L, false, 'no') $$, (select (r->>'id')::uuid from ret where k = 'c1')), 'reject');
select is((select status from public.shop_sales where id = (select (r->>'id')::uuid from bill where k = 'two')), 'paid', 'rejected: bill stays');
insert into ret select 'c2', public.shop_request_return(jsonb_build_object('sale_id', (select (r->>'id')::uuid from bill where k = 'two'), 'kind', 'cancel'));
select lives_ok(format($$ select public.shop_decide_return(%L, true) $$, (select (r->>'id')::uuid from ret where k = 'c2')), 'approve cancel');
select is((select stock_qty from public.products where id = (select v from ids where k = 'a')), 3, 'cancelled bill back in stock');

-- Vendor performance
select is((select (x->>'items')::int from jsonb_array_elements(public.shop_vendor_report(
  (now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date)) x where x->>'name' = 'Vendor Nine'),
  2, 'vendor: pieces sold after returns');

-- Website customers get nothing
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.shop_expenses), 0, 'customer cannot read expenses');
select throws_ok($$ select public.shop_report('2026-01-01', '2026-01-02', 'day') $$, '42501', null, 'customer cannot read reports');
reset role;

select * from finish();
rollback;
