-- ============================================================
-- Royal Fish — схема базы данных (PostgreSQL)
-- Создаётся автоматически при старте сервера (server/store.js
-- → initSchema()). Этот файл — просто читаемая копия схемы
-- для справки, вручную запускать не нужно.
--
-- Использует внешнюю Postgres-базу (например, Neon или
-- Supabase) вместо локального файла/диска — так товары не
-- пропадают при перезапуске бесплатного сервиса на Render.
-- ============================================================

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  -- Осталась от разработки системы ролей, от которой в итоге отказались —
  -- сейчас у любого администратора полный доступ, код role не проверяет.
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','manager','sales','smm')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('fish','shrimp','squid','caviar','delicacy','lobster','other')),
  weight            TEXT NOT NULL,                 -- например "1 кг", "500 г", "250 г"
  description       TEXT,                          -- описание — показывается в оптовом каталоге
  price             NUMERIC NOT NULL CHECK (price >= 0),               -- розничная цена
  discount_percent  INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
  final_price       NUMERIC NOT NULL DEFAULT 0,    -- вычисляется автоматически на сервере (розница)
  is_new            BOOLEAN NOT NULL DEFAULT false, -- метка "Новинка"
  in_stock          BOOLEAN NOT NULL DEFAULT true,  -- наличие
  image_path        TEXT,                          -- secure_url из Cloudinary (или внешний URL демо-товара)
  image_public_id   TEXT,                          -- public_id в Cloudinary — нужен, чтобы удалить старое
                                                     -- фото при замене/удалении товара
  wholesale_price      NUMERIC CHECK (wholesale_price IS NULL OR wholesale_price >= 0), -- опт. цена за ед., NULL = не продаётся оптом
  wholesale_min_qty    INTEGER NOT NULL DEFAULT 1 CHECK (wholesale_min_qty >= 1),        -- минимальная оптовая партия, шт
  available_retail     BOOLEAN NOT NULL DEFAULT true,   -- показывать в розничном каталоге
  available_wholesale  BOOLEAN NOT NULL DEFAULT false,  -- показывать в оптовом каталоге "Для ресторанов"
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- В живом коде (server/store.js) этот столбец добавляется отдельным
-- "ALTER TABLE products ADD COLUMN IF NOT EXISTS image_public_id TEXT;"
-- — это защита для инсталляций, где таблица products была создана ещё
-- до подключения Cloudinary. Здесь показана уже итоговая структура.

-- category → отображаемое название на сайте (используется во фронтенде):
--   fish      → Рыба
--   shrimp    → Креветки
--   squid     → Кальмары
--   caviar    → Икра
--   delicacy  → Морские деликатесы
--   lobster   → Лобстеры
--   other     → Другие
--
-- 'lobster' и 'other' добавлены в список категорий позже исходного
-- запуска проекта. В живом коде это сделано через
-- "ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT" поверх уже
-- существующей таблицы, чтобы не трогать ранее сохранённые товары.
-- Здесь показан сразу итоговый CHECK.

-- ============================================================
-- Заказы
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id                SERIAL PRIMARY KEY,
  order_type        TEXT NOT NULL DEFAULT 'retail' CHECK (order_type IN ('retail','wholesale')),
  company_name      TEXT,                          -- название ресторана — только у оптовых заказов
  customer_name     TEXT NOT NULL,                  -- в опте — контактное лицо
  customer_phone    TEXT NOT NULL,
  customer_address  TEXT,                          -- необязательно (можно самовывоз)
  comment           TEXT,
  total_amount      NUMERIC NOT NULL DEFAULT 0,     -- считается сервером, клиенту не доверяем
  status            TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new','processing','delivering','completed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,   -- снимок названия на момент заказа
  unit_price    NUMERIC NOT NULL, -- снимок цены (со скидкой) на момент заказа
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  subtotal      NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- status → отображаемое название в админке:
--   new         → Новый
--   processing  → В обработке
--   delivering  → Доставляется
--   completed   → Завершён

-- ============================================================
-- Рекламный слайдер на главной
-- ============================================================

CREATE TABLE IF NOT EXISTS promo_slides (
  id                SERIAL PRIMARY KEY,
  image_path        TEXT NOT NULL,
  image_public_id   TEXT,
  title             TEXT,               -- необязательная подпись на слайде
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_slides_sort_order ON promo_slides(sort_order);

-- Специально не ограничено ровно тремя слайдами на уровне БД —
-- sort_order/is_active позволяют добавить больше в будущем.
-- Сайт запрашивает только is_active = true, по sort_order.
