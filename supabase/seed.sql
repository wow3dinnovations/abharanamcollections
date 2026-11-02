-- Sample data for LOCAL development only (`pnpm db:reset`). Never run this on the live database:
-- the live catalog comes from the shop software ("Website" page -> Publish now).
update public.store_settings set
  whatsapp_number = '919999999999',
  phone = '+91 99999 99999',
  email = 'support@abharanamcollections.com',
  address = 'Hyderabad, Telangana',
  announcement = 'Sample data: free shipping on enquiries above ₹1,999 (example text)';

insert into public.categories (local_id, name, code, description, sort_order) values
  ('DEMO-CAT-01', 'Earrings', 'ER', 'Studs, drops and jhumkas for every day and every function', 10),
  ('DEMO-CAT-02', 'Chain', 'CH', 'Short chains in classic and modern patterns', 20),
  ('DEMO-CAT-03', 'Bracelet', 'BR', 'Kada style and flexible bracelets', 30),
  ('DEMO-CAT-04', 'Long Chain', 'LC', 'Long harams and layered chains', 40),
  ('DEMO-CAT-05', 'Pearl Necklace', 'PN', 'Pearl strings with gold-finish pendants', 50),
  ('DEMO-CAT-06', 'Choker', 'CK', 'Close-fitting necklaces for sarees and lehengas', 60),
  ('DEMO-CAT-07', 'Bangles', 'BNG', 'Single bangles and sets', 70),
  ('DEMO-CAT-08', 'Naan Patti', 'NP', 'Traditional naan patti necklaces', 80),
  ('DEMO-CAT-09', 'Hoops', 'HP', 'Gold-finish hoops, small to statement', 90),
  ('DEMO-CAT-10', 'Ear Cuffs', 'EC', 'No-piercing ear cuffs and chains', 100),
  ('DEMO-CAT-11', 'Dollar', 'DL', 'Dollars and pendants', 110),
  ('DEMO-CAT-12', 'Rings', 'RNG', 'Adjustable and fixed-size rings', 120),
  ('DEMO-CAT-13', 'Antique Jewellery', 'AJ', 'Temple and antique finish pieces', 130),
  ('DEMO-CAT-14', 'Anklet', 'ANK', 'Payal and anklets', 140),
  ('DEMO-CAT-15', 'Black Beats', 'BB', 'Black bead chains and nallapusalu', 150),
  ('DEMO-CAT-16', 'Bridal Set', 'BS', 'Complete bridal sets', 160);

insert into public.products (local_id, sku, name, category_id, description, price, mrp, collection, material, colour, tags, stock_qty, is_featured, added_at)
select
  'DEMO-PRD-' || lpad(g::text, 4, '0'),
  'ABH-' || c.code || '-' || lpad(g::text, 6, '0'),
  c.name || ' ' || (array['Lakshmi', 'Mango', 'Peacock', 'Kemp', 'Floral', 'Classic', 'Lotus', 'Ruby'])[1 + g % 8],
  c.id,
  'One gram gold finish. Skin friendly, lightweight and ready for functions.',
  (array[249, 399, 549, 799, 1199, 1499, 2199, 3499])[1 + g % 8],
  case when g % 3 = 0 then round((array[249, 399, 549, 799, 1199, 1499, 2199, 3499])[1 + g % 8] * 1.3 / 10) * 10 - 1 end,
  (array['Daily wear', 'Temple', 'Bridal', 'Party wear'])[1 + g % 4],
  'imitation',
  (array['Gold', 'Gold with ruby', 'Gold with green', 'Gold with pearl'])[1 + g % 4],
  array['new'],
  case when g % 7 = 0 then 0 else 1 + g % 5 end,
  g % 9 = 0,
  now() - (g || ' days')::interval
from generate_series(1, 64) g
join public.categories c on c.local_id = 'DEMO-CAT-' || lpad((1 + g % 16)::text, 2, '0');
