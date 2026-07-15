-- Push értesítési feliratkozások admin számára
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint text UNIQUE NOT NULL,
  keys jsonb NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Csak admin kezelheti a saját feliratkozásait
CREATE POLICY "Admin manage own push subs" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id);
