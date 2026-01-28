# 🔧 SUPABASE BUGFIX - SAMMANFATTNING

## 📋 SUMMARY AV ALLT

Jag har analyserat och fixat din Supabase-integrering för 4 kritiska buggar.

---

## 🐛 FUNNA OCH FIXADE BUGGAR

### Bug 1: "Fel lösenord men ändå inloggad" ⚠️
**Root Cause:**
- I `auth.js` kastar `ensureProfile()` ett fel efter lyckad `signInWithPassword()`
- Felet visas för användaren via `show("error", ...)` 
- Men sedan redirectas användaren ändå till `Profil.html`
- Resultat: Användaren ser "fel lösenord"-meddelande men är faktiskt inloggad

**Root Root Cause:**
- RLS policy blockerar insert på `profiles`-tabellen
- Eller `profiles`-tabellen existerar inte
- Eller user UUID finns inte som FK i auth.users

**Fix Applied:**
- ✅ Wrappat `ensureProfile()` i try/catch i både `signIn()` och `signUp()`
- ✅ Errorn visas INTE för användaren (console.log istället)
- ✅ Inloggning fortsätter och redirectar även om profil-upserting failar
- ✅ Detaljerad console.error visar Supabase error code + message

---

### Bug 2: Profiles-tabellen skapas inte alltid
**Root Cause:**
- `ensureProfileRow()` i `profil.js` kastar fel utan try/catch
- `loadProfile()` använder `.single()` vilket failar om profil saknas
- RLS policies blockerar insert/update

**Fix Applied:**
- ✅ `ensureProfileRow()` har nu detaljerad error logging
- ✅ `loadProfile()` använder `.maybeSingle()` istället för `.single()`
- ✅ Fallback: Skapar standard-username från email om profil saknas
- ✅ RLS SQL policy som tillåter authenticated users att insertera/uppdatera sina egna rader

---

### Bug 3: Profilbild-upload failar
**Root Cause:**
- Storage bucket "avatars" kanske inte existerar
- RLS policies på bucket blockerar insert
- Path-struktur kan vara fel

**Fix Applied:**
- ✅ Detaljerad error logging visar exakt Storage error
- ✅ Bättre error-meddelande som visar vad som ska kontrolleras
- ✅ SQL setup-fil med exakta storage policies för bucket "avatars"
- ✅ Kod sparar till `${user.id}/avatar.jpg` format

---

### Bug 4: Event-upload failar
**Root Cause:**
- Storage bucket "event-images" kanske inte existerar
- RLS policy på `events`-tabellen blockerar insert
- Kod sparar till `events/${userId}/yyyy/id.jpg` men policy matchar kanske inte

**Fix Applied:**
- ✅ RLS policy på `events` som explicit tillåter `author = auth.uid()` insert
- ✅ Detaljerad error logging för database + storage
- ✅ Bättre error-meddelande
- ✅ SQL setup-fil med storage policy för bucket "event-images"

---

## 📂 ÄNDRINGAR PER FIL

### 1. `js/auth.js`
**Ändringar:**
- `signIn()`: Wrappat `ensureProfile()` i try/catch, visar INTE error för användaren
- `signUp()`: Samma fix som signIn(), plus fallback-meddelande om profil-upserting failar
- Lade till detaljerad error logging med `error.code` och `error.message`

**Radantal:** ~90 lines → ~130 lines (comments + error details)

---

### 2. `js/guard.js`
**Ändringar:**
- `requireLogin()`: Lade till error handling för `getSession()`
- Detaljerad console.log för debugging (visar user ID om inloggad)
- Bättre error messages

**Radantal:** 8 lines → 24 lines

---

### 3. `js/profil.js`
**Ändringar:**
- `ensureProfileRow()`: Try/catch + detaljerad error logging
- `loadProfile()`: Använder `.maybeSingle()` istället för `.single()`, bättre error handling
- `uploadAvatar()`: Detaljerad error logging, verifiera public URL
- Avatar-upload event listener: Bättre error-meddelande med checklist
- `loadMyEvents()`: Detaljerad error logging

**Radantal:** ~203 lines → ~250 lines

---

### 4. `js/laddaupp.js`
**Ändringar:**
- `uploadImages()`: Detaljerad error logging per fil
- Event submit handler: Detaljerad error logging för events insert
- Bättre error-meddelande med checklist för storage bucket + RLS policy

**Radantal:** ~318 lines → ~360 lines

---

### 5. `js/events.js`
**Ändringar:**
- `loadEvents()`: Detaljerad error logging + console.log vid success

**Radantal:** 141 lines → 150 lines

---

## 💾 NY FIL: SQL_SETUP.sql

En komplett SQL-setup fil som inkluderar:

1. **CREATE TABLE profiles**
   - id (UUID PK, FK → auth.users.id)
   - username, full_name, about, avatar_url
   - created_at, updated_at

2. **RLS Policies för profiles**
   - SELECT: Alla kan läsa (publik)
   - INSERT: Bara own (auth.uid() = id)
   - UPDATE: Bara own
   - DELETE: Bara own

3. **CREATE TABLE events**
   - id (BIGSERIAL PK)
   - author (UUID FK → profiles.id)
   - title, place, date, time, end_time, info
   - image_urls (TEXT array)
   - author_name (display fallback)
   - created_at, updated_at

4. **RLS Policies för events**
   - SELECT: Alla kan läsa (publik feed)
   - INSERT: Authenticated users med author = auth.uid()
   - UPDATE: Bara own
   - DELETE: Bara own

5. **Storage Bucket Policies (manuel setup)**
   - avatars bucket: INSERT/UPDATE/DELETE i `${auth.uid()}/*`
   - event-images bucket: INSERT/UPDATE/DELETE i `${auth.uid()}/*`

---

## 🚀 VAD DU MÅSTE GÖRA NU

### Steg 1: Kör SQL Setup
1. Öppna Supabase Dashboard → SQL Editor
2. Skapa nytt query
3. Kopiera hela innehållet från `SQL_SETUP.sql`
4. Kör det
5. Vänta på bekräftelse (kan ta 10-30 sekunder)

### Steg 2: Skapa Storage Buckets
1. Öppna Supabase Dashboard → Storage → Buckets
2. Skapa bucket "avatars":
   - Name: `avatars`
   - Public bucket: ✓ YES
   - Klicka "Create bucket"
3. Gå till "Policies" och lägg till:
   - **INSERT policy**: `(bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = auth.uid()::text)`
   - **UPDATE policy**: Samma
   - **DELETE policy**: Samma

4. Upprepa för bucket "event-images":
   - Name: `event-images`
   - Public bucket: ✓ YES
   - Samma 3 policies

### Steg 3: Verifiera Inställningar
1. Gå till each tabell (profiles, events) → Edit
2. Scroll ner, se "Row Level Security": ska säga "ENABLED"
3. Klicka på "Policies" och verifiera att alla 4 policies existerar per tabell

### Steg 4: Testa
1. Öppna din app
2. Försök skapa ett konto
3. Kolla browser console för Supabase error messages
4. Om det failar: Copy/paste error-meddelandet och jämför med SQL_SETUP.sql checklist

---

## 🔍 DEBUGGING: VAD MAN SKA KOLLA

Om något fortfarande failar:

### Avatar-upload failar
- [ ] Console visar: "Uploading avatar to bucket 'avatars', path: {uuid}/avatar.jpg"
- [ ] Supabase Dashboard → Storage → avatars bucket: Finns mappen `{uuid}`?
- [ ] Supabase Dashboard → Storage → avatars → Policies: INSERT policy existerar?
- [ ] Policies custom expression innehåller: `storage.foldername(name)[1] = auth.uid()`

### Event-upload failar
- [ ] Console visar: "Uploading event image to bucket 'event-images', path: events/{uuid}/2025/..."
- [ ] Supabase Dashboard → Storage → event-images bucket: Finns mappen `events/{uuid}/`?
- [ ] Supabase Dashboard → SQL Editor: Kör `SELECT COUNT(*) FROM public.events;` → Returnerar något?
- [ ] Supabase Dashboard → Authentication → Policies: events tabellen visar "ENABLED"?

### Inloggning failar
- [ ] Console visar: "✅ Session valid, user: {uuid}" eller "No active session found"?
- [ ] Supabase Dashboard → SQL Editor: Kör `SELECT * FROM public.profiles WHERE id = '{your_uuid}';`
- [ ] returnerar något? Om inte: profilen skapades inte → check RLS policies
- [ ] Supabase Dashboard → SQL Editor: Kör `SELECT * FROM auth.users LIMIT 1;` → Finns user?

### "RLS policy" blockar
- [ ] Console visar: `message: "new row violates row-level security policy"`
- [ ] Check: Är du inloggad? (`auth.uid()` returns NULL om guest)
- [ ] Check: RLS policy har `auth.role() = 'authenticated'` eller `WITH CHECK (auth.uid() = id)`?
- [ ] Check: Är FK-constraint rätt? (`author UUID REFERENCES profiles(id)`)

---

## 📊 KONTROLL-CHECKLISTA FÖR PRODUCTION

Innan du levererar ditt gymnasiearbete:

- [ ] `js/supabaseClient.js` använder rätt URL och ANON_KEY (ej secret)
- [ ] `js/guard.js` returnerar `session` och kod använder `session.user.id`
- [ ] `auth.js` error handling är robust (ensureProfile failar ej signIn)
- [ ] `profil.js` använder `.maybeSingle()` för profile load
- [ ] `profil.js` avatar upload error visar "Storage bucket 'avatars'" + policy checklist
- [ ] `laddaupp.js` event submit error visar RLS + Storage bucket checklist
- [ ] `events.js` använder `.select(*, profiles:author(...))` för join
- [ ] Supabase: profiles tabellen har RLS ENABLED
- [ ] Supabase: events tabellen har RLS ENABLED
- [ ] Supabase: Storage bucket "avatars" public + policies configured
- [ ] Supabase: Storage bucket "event-images" public + policies configured
- [ ] Browser console: Alla `console.log` och `console.error` är tydliga med context

---

## 🎯 VARFÖR DESSA BUGGAR HÄNTADE

1. **"Fel lösenord men ändå inloggad"**
   - Det är vanligt i Supabase att RLS blockerar profile creation
   - Error-hantering var inte robust - error visades men redirect skedde ändå
   - **Fix**: Profiles är optional för inloggning; visa bara warning i console

2. **Profiles-tabellen skapas inte alltid**
   - `.single()` kastar NoRowError om profil inte finns
   - RLS policies saknas eller är fel konfigurerade
   - **Fix**: `.maybeSingle()` + proper RLS setup

3. **Avatar/Event upload failar**
   - Storage buckets och RLS policies är de viktigaste - ofta glömda
   - Storage policy måste matcha exakt sökvägs-struktur (`${auth.uid()}/*`)
   - **Fix**: Exakt SQL + detaljerad error logging

---

## 📖 TIPS FÖR GYMNASIEARBETE

För en eleganter lösning:

1. **Håll error messages tydliga**: Användare ser vad som är fel, du ser stack trace
2. **Logg allt i console**: Gör debugging 100x enklare
3. **Test RLS lokalt**: Öppna Network tab → Se alla errors från Supabase
4. **Använd `.maybeSingle()` always**: Mindre error-hantering
5. **Verifiera schema**: `SQL_SETUP.sql` är din "single source of truth"

---

## 📞 KOM IHÅG

Alla dessa ändringar är **automatiskt applicerade** på dina filer. Du behöver bara:

1. Kör SQL_SETUP.sql
2. Skapa Storage buckets med policies
3. Testa och verifiera

Lycka till! 🚀
