
-- Products/Plans table for selling tokens
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  credits_per_use INTEGER NOT NULL DEFAULT 100,
  daily_limit INTEGER,
  total_limit INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Public can read active products (for landing page)
CREATE POLICY "Anyone can view active products"
ON public.products FOR SELECT
USING (is_active = true);

-- Admins can manage products
CREATE POLICY "Admins can manage products"
ON public.products FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Orders table for PIX payments
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id),
  transaction_id TEXT UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_document TEXT NOT NULL,
  pix_code TEXT,
  pix_expires_at TIMESTAMP WITH TIME ZONE,
  token_id UUID REFERENCES public.tokens(id),
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Admins can view all orders
CREATE POLICY "Admins can view orders"
ON public.orders FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert/update orders (edge functions)
CREATE POLICY "Service role can insert orders"
ON public.orders FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update orders"
ON public.orders FOR UPDATE
USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default plans
INSERT INTO public.products (name, description, price, credits_per_use, daily_limit, total_limit) VALUES
('Básico', '500 créditos por uso, ideal para começar', 29.90, 500, 1000, 5000),
('Pro', '1000 créditos por uso, perfeito para uso diário', 59.90, 1000, 3000, 15000),
('Elite', '2000 créditos por uso, máximo poder', 99.90, 2000, 5000, 50000);
