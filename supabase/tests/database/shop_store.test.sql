begin;
select plan(12);

-- Shop software data is reachable only with the service_role key.
set local role anon;
select throws_ok($$ select * from public.shop_store_collections() $$, '42501', null, 'anon cannot list shop data');
select throws_ok($$ select public.shop_store_commit('[]') $$, '42501', null, 'anon cannot save shop data');
select throws_ok($$ select * from shop_private.records $$, '42501', null, 'anon cannot read the private schema');
reset role;

set local role authenticated;
select throws_ok($$ select * from public.shop_store_records('products') $$, '42501', null, 'logged-in customer cannot read shop data');
select throws_ok($$ select public.shop_store_replace('[]') $$, '42501', null, 'logged-in customer cannot replace shop data');
reset role;

set local role service_role;
select lives_ok($$ select public.shop_store_replace('[{"c":"products","rev":3,"records":[{"id":"P1","n":1},{"id":"P2","n":2}]},
                                                    {"c":"settings","rev":1,"doc":{"shop":"Abharanam"}}]') $$, 'service role can replace');
select lives_ok($$ select public.shop_store_commit('[{"c":"products","rev":4,"up":[{"id":"P1","n":10},{"id":"P3","n":3}],"del":["P2"]}]') $$,
  'service role can save a change');
select results_eq($$ select data->>'id' from public.shop_store_records('products') $$, array['P1', 'P3'],
  'order is kept, updates stay in place, deletes are removed');
select is((select (data->>'n')::int from public.shop_store_records('products') where data->>'id' = 'P1'), 10, 'update saved');
select throws_ok($$ select public.shop_store_commit('[{"c":"products","rev":4,"up":[{"id":"P9"}]}]') $$, '40001', null,
  'a stale copy cannot overwrite newer data');
select is((select count(*)::int from public.shop_store_records('products') where data->>'id' = 'P9'), 0, 'nothing saved from the stale copy');
select is((select doc->>'shop' from public.shop_store_collections() where name = 'settings'), 'Abharanam', 'settings document saved');
reset role;

select * from finish();
rollback;
