-- =============================================================================
-- SUPABASE DATABASE SETUP - Kör denna SQL i Supabase SQL Editor
-- =============================================================================
-- 
-- INSTRUKTIONER:
-- 1. Gå till Supabase Dashboard > SQL Editor
-- 2. Skapa ett nytt query
-- 3. Kopiera ALLT nedan och kör det
-- 4. Om något failar, läs errorn och justera (t.ex. tabeller kan redan finnas)
-- 5. Skapa Storage buckets SEPARAT (se instruktioner längre ner)

-- =============================================================================
-- 1. CREATE TABLE: profiles
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL PRIMARY KEY,
  username TEXT,
  full_name TEXT,
  about TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  
  -- Foreign key till auth.users
  CONSTRAINT fk_profiles_auth FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Ge tabellen tillräckliga index
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Enable RLS på profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES: profiles
-- =============================================================================
-- Policy 1: Alla kan läsa profiler (för att visa i feed/namn på events)
CREATE POLICY "Profiles readable by all"
  ON public.profiles FOR SELECT
  USING (TRUE);

-- Policy 2: Användare kan bara inserera sin egen profil
CREATE POLICY "Profiles insertable by owner"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policy 3: Användare kan bara uppdatera sin egen profil
CREATE POLICY "Profiles updatable by owner"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 4: Användare kan bara radera sin egen profil
CREATE POLICY "Profiles deletable by owner"
  ON public.profiles FOR DELETE
  USING (auth.uid() = id);


-- =============================================================================
-- 2. CREATE TABLE: events
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.events (
  id BIGSERIAL PRIMARY KEY,
  author UUID NOT NULL,
  title TEXT NOT NULL,
  place TEXT,
  date TEXT, -- Format: "2025-03-15" (YYYY-MM-DD)
  time TEXT, -- Format: "14:30" (HH:MM)
  end_time TEXT, -- Format: "16:45" eller "sent"
  info TEXT,
  image_urls TEXT[], -- Array av public URLs
  author_name TEXT, -- Display-namn (optional, för fallback)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  
  -- Foreign key till profiles.id -> auth.users.id
  CONSTRAINT fk_events_author FOREIGN KEY (author) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Indexes för performance
CREATE INDEX IF NOT EXISTS idx_events_author ON public.events(author);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_date ON public.events(date);

-- Enable RLS på events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES: events
-- =============================================================================
-- Policy 1: Alla kan läsa events (publik feed)
CREATE POLICY "Events readable by all"
  ON public.events FOR SELECT
  USING (TRUE);

-- Policy 2: Authenticated users kan inserera events där author = sin eget ID
CREATE POLICY "Events insertable by authenticated users"
  ON public.events FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND author = auth.uid()
  );

-- Policy 3: Användare kan bara uppdatera sina egna events
CREATE POLICY "Events updatable by owner"
  ON public.events FOR UPDATE
  USING (auth.uid() = author)
  WITH CHECK (auth.uid() = author);

-- Policy 4: Användare kan bara radera sina egna events
CREATE POLICY "Events deletable by owner"
  ON public.events FOR DELETE
  USING (auth.uid() = author);


-- =============================================================================
-- 3. STORAGE BUCKETS - Instruktioner för Storage Console
-- =============================================================================
-- 
-- Gå till Supabase Dashboard > Storage > Buckets
-- 
-- A) Skapa bucket "avatars":
--    - Name: avatars
--    - Public bucket: YES (så att avatar-URLs är offentliga)
--    - Klicka "Create bucket"
--    - Gå sedan till "Policies" och lägg till:
--
--    Policy 1 (INSERT):
--      - Effect: ALLOW
--      - Operation: INSERT
--      - Authenticated: YES
--      - Target roles: authenticated
--      - Custom expression (optional): 
--        (bucket_id = 'avatars'::text) AND 
--        ((storage.foldername(name))[1] = auth.uid()::text)
--
--    Policy 2 (UPDATE):
--      - Effect: ALLOW
--      - Operation: UPDATE
--      - Authenticated: YES
--      - Target roles: authenticated
--      - Custom expression:
--        (bucket_id = 'avatars'::text) AND 
--        ((storage.foldername(name))[1] = auth.uid()::text)
--
--    Policy 3 (DELETE):
--      - Effect: ALLOW
--      - Operation: DELETE
--      - Authenticated: YES
--      - Target roles: authenticated
--      - Custom expression:
--        (bucket_id = 'avatars'::text) AND 
--        ((storage.foldername(name))[1] = auth.uid()::text)
--
-- B) Skapa bucket "event-images":
--    - Name: event-images
--    - Public bucket: YES
--    - Klicka "Create bucket"
--    - Gå sedan till "Policies" och lägg till samma 3 policies som avatars:
--
--    Policy 1 (INSERT):
--      - Effect: ALLOW
--      - Operation: INSERT
--      - Authenticated: YES
--      - Target roles: authenticated
--      - Custom expression:
--        (bucket_id = 'event-images'::text) AND 
--        ((storage.foldername(name))[1] = auth.uid()::text)
--
--    Policy 2 (UPDATE):
--      - Effect: ALLOW
--      - Operation: UPDATE
--      - Authenticated: YES
--      - Target roles: authenticated
--      - Custom expression:
--        (bucket_id = 'event-images'::text) AND 
--        ((storage.foldername(name))[1] = auth.uid()::text)
--
--    Policy 3 (DELETE):
--      - Effect: ALLOW
--      - Operation: DELETE
--      - Authenticated: YES
--      - Target roles: authenticated
--      - Custom expression:
--        (bucket_id = 'event-images'::text) AND 
--        ((storage.foldername(name))[1] = auth.uid()::text)


-- =============================================================================
-- 4. VERIFIERA SETUP
-- =============================================================================
-- Kör dessa queries för att verifiera att allt är rätt:

-- Visa profiles-tabellen
-- SELECT * FROM public.profiles LIMIT 5;

-- Visa events-tabellen
-- SELECT * FROM public.events LIMIT 5;

-- Visa RLS policies på profiles
-- SELECT * FROM pg_policies WHERE tablename = 'profiles';

-- Visa RLS policies på events
-- SELECT * FROM pg_policies WHERE tablename = 'events';

-- Verifiera foreign keys
-- SELECT constraint_name, table_name, column_name 
-- FROM information_schema.constraint_column_usage 
-- WHERE table_name IN ('profiles', 'events');


-- =============================================================================
-- 5. TROUBLESHOOTING
-- =============================================================================
--
-- Om något failar:
--
-- A) "duplicate key value violates unique constraint":
--    -> Tabellen existerar redan. Det är OK - RLS policies läggs till ändå.
--
-- B) "foreign key constraint fails":
--    -> Du måste köra PROFILE-delen före EVENT-delen
--
-- C) RLS policies fungerar inte:
--    -> Gå till Supabase Dashboard > Authentication > Policies
--    -> Kontrollera att "Row Level Security" är ENABLED på respektive tabell
--    -> Om du ser "RLS Policy" = "ENABLED", då är det på
--
-- D) Upload failar trots policy:
--    -> Kontrollera att bucket-namnet EXAKT matchar kod (avatars, event-images)
--    -> Kontrollera att storage.foldername(name) syntax är rätt
--    -> Test manuellt i Storage console
--
-- =============================================================================

