# ✅ INSTALLATION & VERIFICERINGS-GUIDE

## 📋 STEG FÖR STEG INSTRUKTIONER

### STEG 1: Kör SQL Setup (5-10 minuter)

1. Öppna **Supabase Dashboard** → gå till ditt projekt
2. Klicka **SQL Editor** (vänstra menyn)
3. Klicka **New Query**
4. Öppna filen `SQL_SETUP.sql` från ditt projekt
5. **Kopiera ALLT innehål** (Ctrl+A, Ctrl+C)
6. **Klistra in** i SQL-editorn (Ctrl+V)
7. Klicka **Run** eller tryck **Ctrl+Enter**
8. **Vänta** tills du ser "success" eller "completed"

**Om du får error:**
- "duplicate key value" = OK, tabellen existerar redan
- "foreign key constraint" = Köra PROFILES-delen först
- "permission denied" = Du har inte admin-access, kontakta Supabase support

### STEG 2: Skapa Storage Buckets (5 minuter)

#### 2A: Bucket "avatars"

1. Öppna **Supabase Dashboard** → **Storage** (vänstra menyn)
2. Klicka **Create Bucket**
3. **Name:** `avatars`
4. **Public bucket:** ✓ Kryssa
5. Klicka **Create bucket**
6. Vänta tills bucketen visas i listan
7. **Klicka på "avatars" bucketen**
8. **Gå till fliken "Policies"** (längst upp)
9. Klicka **Add new policy**
10. **Choose a template:** Select "For authenticated users"
11. **Name:** `Allow insert in user folder`
12. **Operations:** ✓ INSERT
13. **Target roles:** ✓ authenticated
14. **Custom expression:** 
    ```
    (bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = auth.uid()::text)
    ```
15. Klicka **Create policy**
16. **Upprepa 9-15** för UPDATE:
    - **Name:** `Allow update in user folder`
    - **Operations:** ✓ UPDATE
    - **Custom expression:** Samma som ovan
17. **Upprepa 9-15** för DELETE:
    - **Name:** `Allow delete in user folder`
    - **Operations:** ✓ DELETE
    - **Custom expression:** Samma som ovan

#### 2B: Bucket "event-images"

Upprepa **exakt samma steg** som 2A men byt "avatars" mot "event-images":
- **Bucket name:** `event-images`
- **3 policies:** INSERT, UPDATE, DELETE (samma custom expression)

**Verifiera:**
```
Supabase Dashboard → Storage → Buckets
Du ska se:
✓ avatars (3 policies)
✓ event-images (3 policies)
```

---

### STEG 3: Verifiera Database Setup (5 minuter)

1. Öppna **Supabase Dashboard** → **SQL Editor**
2. Klicka **New Query**
3. Klistra in och kör denna:

```sql
-- Verifiera tables existerar
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
```

**Du ska se:**
- `profiles`
- `events`

4. Klicka **New Query** igen
5. Klistra in och kör denna:

```sql
-- Verifiera RLS är ENABLED
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' AND tablename IN ('profiles', 'events');
```

**Du ska se:**
- `profiles | true`
- `events | true`

6. Klicka **New Query** igen
7. Klistra in och kör denna:

```sql
-- Verifiera RLS policies existerar
SELECT tablename, policyname, permissive, qual FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;
```

**Du ska se minst 8 policies:**
- profiles: 4 policies (Select, Insert, Update, Delete)
- events: 4 policies (Select, Insert, Update, Delete)

---

### STEG 4: Verifiera Storage Buckets (3 minuter)

1. Öppna **Supabase Dashboard** → **Storage**
2. Klicka på **avatars** bucket
3. Se till att det finns en mapp/fil eller möjlighet att ladda upp
4. Gå till **Policies** tab
5. Du ska se **3 policies:**
   - Allow insert in user folder
   - Allow update in user folder
   - Allow delete in user folder
6. Upprepa för **event-images** bucket

---

### STEG 5: Testa i Din App (10 minuter)

#### Test 1: Skapa konto & logga in

1. Öppna din app (ex: `http://localhost:8000/html/Auth.html`)
2. Skapa ett nytt konto (email + password)
3. **Öppna Browser Console** (F12 → Console tab)
4. Du ska se:
   ```
   ✅ Profile row ensured for {uuid}
   ✅ Session valid, user: {uuid}
   ```
5. Om du ser **ERROR** istället:
   - Kopiera exakt error-meddelande
   - Gå till SQL_SETUP.sql och leita efter `CREATE POLICY` med samma fel

#### Test 2: Ladda upp profilbild

1. Gå till Profil-sidan
2. Klicka "Profilbild" och välj en JPG/PNG fil
3. **Console ska visa:**
   ```
   Uploading avatar to bucket 'avatars', path: {uuid}/avatar.jpg
   ✅ Avatar uploaded and DB updated
   ```
4. Om du ser ERROR:
   ```
   Storage upload error: { code: ..., message: ..., statusCode: ... }
   ```
   - Kontrollera att bucket "avatars" existerar
   - Kontrollera att policies är korrekt (se steg 2A ovan)

#### Test 3: Ladda upp event

1. Gå till "Ladda upp" sidan
2. Fyll i alla fält (titel, plats, datum, tid)
3. Lägg till en eller två bilder (valfritt)
4. Klicka "Ladda upp"
5. **Console ska visa:**
   ```
   Uploading event image to bucket 'event-images', path: events/{uuid}/2025/...
   ✅ Image uploaded: https://...
   Creating event with payload: { ... }
   ✅ Event created successfully
   ```
6. Om du ser ERROR:
   ```
   Event insert error: { code: ..., message: ... }
   ```
   - Kontrollera RLS policy på events-tabellen
   - Kontrollera att bucket "event-images" policies är rätt

#### Test 4: Se feed & profil

1. Gå till "Hem" sidan
2. Du ska se ditt event i feed (eller tom feed om ingen event skapats)
3. Gå till Profil-sidan
4. Du ska se "1 publicerade händelser" + ditt event listade

---

## 🔴 COMMON ERRORS & FIXES

### Error 1: "Fel lösenord" visas efter inloggning

**Symptom:**
- Du ser felmeddelandet "Kunde inte logga in"
- Men du blir ändå inloggad (om du trycker back, du är på Profil-sidan)

**Orsak:**
- RLS policy blockerar profile insert
- eller profiles-tabellen saknas

**Fix:**
1. Öppna SQL Editor
2. Kör: `SELECT * FROM public.profiles LIMIT 1;`
3. Om du får error "table does not exist" → Kör SQL_SETUP.sql igen
4. Om tabellen finns men är tom → RLS policy blockerar insert
   - Kontrollera: `SELECT * FROM pg_policies WHERE tablename = 'profiles';`
   - Du ska se INSERT policy med `WITH CHECK (auth.uid() = id)`

### Error 2: "Kunde inte spara profilbild"

**Symptom:**
- Avatar-upload visar error-meddelande
- Console visar: "Storage upload error: { message: '...' }"

**Orsak:**
- Bucket "avatars" existerar inte
- eller RLS policy är fel

**Fix:**
1. Supabase Dashboard → Storage → Se "avatars" bucket?
   - Om inte → Skapa den (se steg 2A ovan)
2. Klicka avatars → Policies
   - Du ska se 3 policies (INSERT, UPDATE, DELETE)
   - Öppna INSERT policy, verifiera:
   ```
   (bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = auth.uid()::text)
   ```
   - Om den är tom eller annorlunda → Radera och skapa ny

### Error 3: "Kunde inte ladda upp" (event)

**Symptom:**
- Event-upload visar: "❌ Kunde inte ladda upp. Kolla RLS policies..."
- Console visar: "Event insert error: { message: '...' }"

**Orsak:**
- Bucket "event-images" existerar inte
- eller RLS policy på events-tabellen blockerar insert

**Fix:**

1. **Check bucket:**
   - Supabase Dashboard → Storage → Se "event-images" bucket?
   - Om inte → Skapa den (se steg 2B ovan)

2. **Check RLS policy på events:**
   - SQL Editor → kör:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'events' AND operation = 'INSERT';
   ```
   - Du ska se policy med:
   ```sql
   auth.role() = 'authenticated' AND author = auth.uid()
   ```
   - Om den saknas eller är fel → Kör SQL_SETUP.sql igen

### Error 4: "permission denied for schema public"

**Orsak:**
- Du använder SECRET key istället för ANON key i supabaseClient.js

**Fix:**
- Öppna `js/supabaseClient.js`
- Verifiera: `SUPABASE_ANON_KEY = "sb_publishable_..."`
- Om det är något annat → Kopiera rätt ANON key från Supabase Dashboard

### Error 5: "new row violates row-level security policy"

**Orsak:**
- RLS policy blockerar din operation
- Du kanske försöker insertera med fel author/user_id

**Debug:**
1. Browser console → Öppna ditt event payload:
   ```javascript
   console.log("Creating event with payload:", payload);
   ```
2. Se att `author: {your_uuid}` existerar
3. Verifiera att din profil existerar:
   - SQL Editor:
   ```sql
   SELECT * FROM public.profiles WHERE id = '{your_uuid}';
   ```
4. Om profilen saknas → Skapa den genom att ladda Profil-sidan

---

## 🧪 MANUAL TESTING I SQL EDITOR

Om du vill testa RLS utan att använda UI:

### Test 1: Läsa data (guest)
```sql
-- Guests kan läsa profiles
SELECT * FROM public.profiles LIMIT 1;
```
✓ Ska returnera data

### Test 2: Läsa data (authenticated)
```sql
-- Du kan läsa profiles om du är inloggad
-- (Supabase gör detta automatiskt i konsolen)
SELECT * FROM public.profiles LIMIT 1;
```
✓ Ska returnera data

### Test 3: Inserera profil (endast egen)
```sql
-- RLS blockerar detta om id != auth.uid()
INSERT INTO public.profiles (id, username) 
VALUES ('non-existent-uuid', 'test');
```
✗ Ska ge: `new row violates row-level security policy`

### Test 4: Inserera event (endast eget)
```sql
-- RLS blockerar detta om author != auth.uid()
INSERT INTO public.events (author, title, place, date, time) 
VALUES ('other-user-uuid', 'Test', 'Test', '2025-01-01', '10:00');
```
✗ Ska ge: `new row violates row-level security policy`

---

## 📊 CHECKLIST FÖR DELIVERY

Innan du levererar ditt gymnasiearbete, kontrollera:

### Databas
- [ ] `CREATE TABLE profiles` existerar
- [ ] `CREATE TABLE events` existerar
- [ ] 4 RLS policies på profiles
- [ ] 4 RLS policies på events
- [ ] Foreign key: `events.author → profiles.id`

### Storage
- [ ] Bucket "avatars" existerar och är public
- [ ] 3 policies på avatars (INSERT, UPDATE, DELETE)
- [ ] Bucket "event-images" existerar och är public
- [ ] 3 policies på event-images (INSERT, UPDATE, DELETE)

### Kod
- [ ] `auth.js` har error handling för `ensureProfile()`
- [ ] `guard.js` loggar session status
- [ ] `profil.js` använder `.maybeSingle()` för profile load
- [ ] `laddaupp.js` har detailed error messages
- [ ] `events.js` använder join med profiles

### Testing
- [ ] Kan skapa konto utan "wrong password" error
- [ ] Kan ladda upp profilbild
- [ ] Kan ladda upp event med bilder
- [ ] Feed visar alla events
- [ ] Profil-sidan visar "mina events"

---

## 🎓 FÖR GYMNASIEARBETET

Om du ska skriva om detta tekniskt:

**RLS (Row Level Security):**
- "Databaskontroll som säger vem som kan läsa/skriva vilken rad"
- "Utan RLS: Alla users kan se ALLT"
- "Med RLS: Vi lägger begränsningar per operation (SELECT, INSERT, UPDATE, DELETE)"

**Storage policies:**
- "Samma som RLS men för filer/bilder"
- "Begränsar vilket folder users kan ladda upp till"
- "Vi låter alla ladda upp till `${auth.uid()}/*` (sin egen folder)"

**Varför buggar häntade:**
- "RLS policies var inte konfigurerade från början"
- "Error-hantering visade fel även fast operation lyckades"
- "`.single()` kraschade om data inte fanns (använd `.maybeSingle()`)"

---

## 📞 SUPPORT

Om något fortfarande failar:

1. **Öppna Browser Console** (F12)
2. **Kör testen** (steg 5 ovan)
3. **Kopiera exakt error message**
4. **Kontrollera:**
   - Matchar error något i denna guide?
   - Kan du hitta motsvarande SQL policy i SQL_SETUP.sql?
   - Är bucket-namn exakt samma som i kod?

5. **Last resort:** Radera och skapa om
   - SQL Editor: `DROP TABLE IF EXISTS events CASCADE;`
   - SQL Editor: `DROP TABLE IF EXISTS profiles CASCADE;`
   - Storage → Delete buckets
   - Kör SQL_SETUP.sql helt från början

Lycka till! 🚀

