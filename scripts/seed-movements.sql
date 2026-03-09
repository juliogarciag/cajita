-- Seed 5000 movements with random data over the last 10 years
-- Run: docker compose exec -T db psql -U cajita -d cajita < scripts/seed-movements.sql

DELETE FROM movements;

INSERT INTO movements (id, description, date, amount_cents, category_id, sort_position, created_at, updated_at)
SELECT
  gen_random_uuid(),
  description,
  date,
  amount_cents,
  category_id,
  sort_position,
  (date::timestamp + (random() * interval '12 hours')) AS created_at,
  (date::timestamp + (random() * interval '12 hours')) AS updated_at
FROM (
  SELECT
    -- Random date in last 10 years
    (CURRENT_DATE - (random() * 3650)::int) AS date,

    -- Random description from realistic pool
    (ARRAY[
      'Grocery store', 'Supermarket run', 'Weekly groceries', 'Farmers market',
      'Electric bill', 'Water bill', 'Gas bill', 'Internet bill', 'Phone bill',
      'Rent payment', 'Mortgage payment', 'HOA dues',
      'Restaurant dinner', 'Coffee shop', 'Lunch out', 'Fast food', 'Pizza delivery',
      'Gas station', 'Car insurance', 'Car maintenance', 'Oil change', 'New tires',
      'Monthly salary', 'Freelance payment', 'Side project income', 'Bonus',
      'Amazon purchase', 'Online shopping', 'Electronics', 'Clothing store',
      'Netflix subscription', 'Spotify subscription', 'Gym membership', 'Yoga class',
      'Doctor visit', 'Pharmacy', 'Dental checkup', 'Eye exam',
      'Flight tickets', 'Hotel booking', 'Airbnb stay', 'Train ticket',
      'Birthday gift', 'Christmas present', 'Anniversary dinner',
      'Home repair', 'Plumber', 'Electrician', 'Furniture',
      'Tax payment', 'Tax refund', 'Quarterly taxes',
      'Transfer from savings', 'Transfer to savings', 'Investment deposit',
      'ATM withdrawal', 'Bank fee', 'Interest earned',
      'Haircut', 'Dry cleaning', 'Pet food', 'Vet visit',
      'Book purchase', 'Course subscription', 'Conference ticket',
      'Charity donation', 'Church tithe',
      'Parking fee', 'Toll road', 'Uber ride', 'Bus pass',
      'Wine store', 'Liquor store', 'Bar tab',
      'Kids school supplies', 'Tuition payment', 'Daycare',
      'Home insurance', 'Life insurance', 'Health insurance premium'
    ])[floor(random() * 72 + 1)] AS description,

    -- Random amount: mix of income (positive) and expenses (negative)
    -- ~20% income (larger amounts), ~80% expenses (smaller amounts)
    CASE
      WHEN random() < 0.05 THEN (random() * 500000 + 200000)::int   -- salary: $2000-$7000
      WHEN random() < 0.10 THEN (random() * 200000 + 10000)::int    -- other income: $100-$2100
      WHEN random() < 0.30 THEN -(random() * 100000 + 50000)::int   -- big expense: $500-$1500
      WHEN random() < 0.60 THEN -(random() * 30000 + 5000)::int     -- medium expense: $50-$350
      ELSE -(random() * 5000 + 100)::int                            -- small expense: $1-$51
    END AS amount_cents,

    -- Random category (nullable ~10% of the time)
    CASE WHEN random() < 0.10 THEN NULL
    ELSE (ARRAY[
      'd7bc11e1-3b52-4f00-bdba-990c04d518b6',  -- Free Income
      '653a5350-2f1a-4845-86ed-7b95e44039b1',  -- Salary
      'b3753937-d500-4e8e-af43-1453db8992ab',  -- Budget
      'c28d0126-c0c5-4561-bd5e-d39770b6c85a',  -- Help
      '82735764-4fc6-4829-a483-e66df62f0f3e',  -- Taxes
      'b284c8c1-f0a7-40c8-8936-d667dd00d623',  -- Discretionary Expenses
      '6cdef147-a498-41f0-a2c6-b853a5c7df74'   -- Goodies
    ])[floor(random() * 7 + 1)]::uuid
    END AS category_id,

    -- Sort position: row_number * 1000 within each date (assigned after)
    row_number() OVER () * 1000 AS sort_position

  FROM generate_series(1, 5000)
) AS data;

-- Fix sort_position to be sequential per date
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY date ORDER BY created_at, id) * 1000 AS new_pos
  FROM movements
)
UPDATE movements SET sort_position = ranked.new_pos
FROM ranked WHERE movements.id = ranked.id;

SELECT
  count(*) AS total_movements,
  min(date) AS earliest_date,
  max(date) AS latest_date,
  count(DISTINCT date) AS unique_dates
FROM movements;
