# 🔐 SUPABASE RLS & STORAGE POLICIES - TEKNISK REFERENS

## OVERVIEW: Hur RLS funkar

**Row Level Security (RLS)** begränsar vad en authenticated user kan se/göra med data.

Utan RLS: Alla users kan läsa/skriva ALL data
Med RLS: Kod måste säga "SELECT * WHERE rls_policy_är_ok"

---

## 1. RLS POLICIES PÅ TABLES

### profiles-tabellen

#### Policy 1: SELECT - "Profiles readable by all"
```sql
CREATE POLICY "Profiles readable by all"
  ON public.profiles FOR SELECT
  USING (TRUE);
```
**Vad den gör:** Alla (guests + authenticated) kan läsa alla profiler
**Varför:** Vi vill visa användarnamn + avatar i feed

#### Policy 2: INSERT - "Profiles insertable by owner"
```sql
CREATE POLICY "Profiles insertable by owner"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
```
**Vad den gör:** User kan bara inserera en rad där `id = auth.uid()`
**Varför:** Du kan bara skapa din egen profil, inte andras

**Kod som använder detta:**
```javascript
// auth.js ensureProfile()
const { error } = await supabase
  .from("profiles")
  .upsert({ id: user.id, username }, { onConflict: "id" });
// RLS policy checkar: user.id === auth.uid() ✓
```

#### Policy 3: UPDATE - "Profiles updatable by owner"
```sql
CREATE POLICY "Profiles updatable by owner"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```
**Vad den gör:** User kan bara uppdatera sin egen rad
**Varför:** Du kan bara ändra din egen profil

**Kod som använder detta:**
```javascript
// profil.js uploadAvatar()
const { error: dbErr } = await supabase
  .from("profiles")
  .update({ avatar_url: publicUrl })
  .eq("id", user.id);
// RLS policy checkar: user.id === auth.uid() ✓
```

#### Policy 4: DELETE - "Profiles deletable by owner"
```sql
CREATE POLICY "Profiles deletable by owner"
  ON public.profiles FOR DELETE
  USING (auth.uid() = id);
```
**Vad den gör:** User kan bara radera sin egen rad
**Varför:** Du kan bara ta bort din egen profil

---

### events-tabellen

#### Policy 1: SELECT - "Events readable by all"
```sql
CREATE POLICY "Events readable by all"
  ON public.events FOR SELECT
  USING (TRUE);
```
**Vad den gör:** Alla kan läsa alla events
**Varför:** Feed är publik - alla ska kunna se händelser

#### Policy 2: INSERT - "Events insertable by authenticated users"
```sql
CREATE POLICY "Events insertable by authenticated users"
  ON public.events FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND author = auth.uid()
  );
```
**Vad den gör:** Authenticated user kan inserera där `author = auth.uid()`
**Varför:** Du kan bara skapa events som är ditt namn (author = din ID)

**Kod som använder detta:**
```javascript
// laddaupp.js form submit
const payload = {
  title: data.title,
  author: freshUser.id,  // ← RLS checkar: author === auth.uid()
  // ...
};
const { error } = await supabase.from("events").insert([payload]);
```

**Viktigt:** `auth.role() = 'authenticated'` betyder att ENDAST inloggade users kan inserera!

#### Policy 3: UPDATE - "Events updatable by owner"
```sql
CREATE POLICY "Events updatable by owner"
  ON public.events FOR UPDATE
  USING (auth.uid() = author)
  WITH CHECK (auth.uid() = author);
```
**Vad den gör:** User kan bara uppdatera events där `author = auth.uid()`
**Varför:** Du kan bara ändra dina egna events

#### Policy 4: DELETE - "Events deletable by owner"
```sql
CREATE POLICY "Events deletable by owner"
  ON public.events FOR DELETE
  USING (auth.uid() = author);
```
**Vad den gör:** User kan bara radera events där `author = auth.uid()`
**Varför:** Du kan bara ta bort dina egna events

---

## 2. RLS POLICIES PÅ STORAGE BUCKETS

Storage policies är LITE ANNORLUNDA än table policies - de använder `storage.foldername()`.

### Bucket: "avatars"

#### Policy: INSERT
```
Effect: ALLOW
Operation: INSERT
Authenticated: YES
Target roles: authenticated
Custom expression:
(bucket_id = 'avatars'::text) AND 
((storage.foldername(name))[1] = auth.uid()::text)
```

**Vad den gör:**
- `bucket_id = 'avatars'` → Bara denna bucket
- `storage.foldername(name)[1]` → Första folder i path
- `= auth.uid()::text` → Måste matcha din user ID

**Exempel:**
- User ID: `550e8400-e29b-41d4-a716-446655440000`
- Path: `550e8400-e29b-41d4-a716-446655440000/avatar.jpg` ✓ Allowed
- Path: `other-user-id/avatar.jpg` ✗ Blocked by RLS

**Kod som använder detta:**
```javascript
// profil.js uploadAvatar()
const path = `${user.id}/avatar.${ext}`;
const { error: upErr } = await supabase.storage
  .from("avatars")
  .upload(path, file, { upsert: true });
// RLS checkar: (storage.foldername(path))[1] === auth.uid() ✓
```

#### Policy: UPDATE
```
Effect: ALLOW
Operation: UPDATE
Authenticated: YES
Target roles: authenticated
Custom expression:
(bucket_id = 'avatars'::text) AND 
((storage.foldername(name))[1] = auth.uid()::text)
```

**Samma som INSERT** - detta gör `{ upsert: true }` möjligt

#### Policy: DELETE
```
Effect: ALLOW
Operation: DELETE
Authenticated: YES
Target roles: authenticated
Custom expression:
(bucket_id = 'avatars'::text) AND 
((storage.foldername(name))[1] = auth.uid()::text)
```

**Samma som INSERT/UPDATE**

---

### Bucket: "event-images"

#### Policy: INSERT
```
Effect: ALLOW
Operation: INSERT
Authenticated: YES
Target roles: authenticated
Custom expression:
(bucket_id = 'event-images'::text) AND 
((storage.foldername(name))[1] = auth.uid()::text)
```

**Vad den gör:** Same som "avatars" men för event-images bucket

**Exempel:**
- User ID: `550e8400-e29b-41d4-a716-446655440000`
- Path: `events/550e8400-e29b-41d4-a716-446655440000/2025/abc123.jpg` ✓ Allowed
  - `storage.foldername()` på detta returnerar: `["events", "550e8400-e29b-41d4-a716-446655440000", "2025", "abc123.jpg"]`
  - `[1]` = andra element = `550e8400-e29b-41d4-a716-446655440000` ✓

**Kod som använder detta:**
```javascript
// laddaupp.js safePath()
function safePath(file, userId) {
  const id = crypto.randomUUID();
  const yyyy = new Date().getFullYear();
  return `events/${userId}/${yyyy}/${id}.${ext}`;
  // Returnerar: "events/{userId}/2025/abc123.jpg"
}

// Sedan:
const path = safePath(file, freshUser.id);
const { error: upErr } = await supabase.storage
  .from("event-images")
  .upload(path, file, { upsert: false });
// RLS checkar: (storage.foldername(path))[1] === auth.uid() ✓
```

#### Policy: UPDATE
Same som INSERT (för framtida use case)

#### Policy: DELETE
Same som INSERT

---

## 3. TROUBLESHOOTING: RLS POLICY ERRORS

### Error: "new row violates row-level security policy"

**Meaning:** RLS policy blocked your INSERT/UPDATE

**Debug steps:**

1. **Check if you're authenticated:**
   ```javascript
   const { data } = await supabase.auth.getSession();
   if (!data?.session) {
     console.log("NOT LOGGED IN - auth.uid() = NULL");
     // RLS policies won't work for guests!
   }
   ```

2. **Check the policy condition:**
   ```sql
   -- For profiles table:
   -- Policy says: "author = auth.uid()"
   -- Your code does:
   const { error } = await supabase
     .from("events")
     .insert([{ author: someOtherId }]); // ← This fails!
   
   -- Fix: Use your own ID
   const { error } = await supabase
     .from("events")
     .insert([{ author: user.id }]); // ✓ Matches auth.uid()
   ```

3. **Check foreign keys:**
   ```sql
   -- events.author must match a real profile ID
   -- If profile doesn't exist, FK constraint fails:
   INSERT INTO events (author, ...) VALUES ('non-existent-uuid', ...)
   -- Error: foreign key constraint violated
   
   -- Fix: Ensure profile exists first
   await ensureProfileRow(user); // Creates profile if missing
   ```

### Error: "relation 'public.events' does not exist"

**Meaning:** Table hasn't been created yet

**Fix:** Run SQL_SETUP.sql in Supabase SQL Editor

### Error: "permission denied for schema public"

**Meaning:** Your Supabase API key doesn't have permissions

**Fix:** Use ANON key, not SECRET key
```javascript
// supabaseClient.js - CORRECT
const SUPABASE_ANON_KEY = "sb_publishable_..."; // ✓

// WRONG
const SUPABASE_SECRET_KEY = "..."; // ✗
```

### Error: "Authentication required" on storage upload

**Meaning:** Storage policy requires authenticated user

**Fix:** Make sure `requireLogin()` is called first
```javascript
// laddaupp.js - CORRECT
const session = await requireLogin(); // ✓ Sets up auth context
const imageUrls = await uploadImages(data.files, session.user.id);

// WRONG
const imageUrls = await uploadImages(data.files, someRandomId); // ✗
```

---

## 4. VERIFYING RLS IS WORKING

### In SQL Editor:

```sql
-- Check that RLS is ENABLED
SELECT * FROM pg_tables 
WHERE tablename IN ('profiles', 'events') 
AND schemaname = 'public';

-- Check policies exist
SELECT * FROM pg_policies WHERE tablename = 'profiles';
SELECT * FROM pg_policies WHERE tablename = 'events';
```

### In Browser Console:

```javascript
// Test if you can read profiles
const { data, error } = await supabase.from("profiles").select("*");
console.log("Read profiles:", { data, error });

// Test if you can insert event (requires login)
const { error: insertError } = await supabase
  .from("events")
  .insert([{ author: auth.uid(), title: "Test" }]);
console.log("Insert event:", { insertError });
```

---

## 5. POLICY SYNTAX CHEAT SHEET

### FOR TABLE POLICIES:

```sql
-- Guest/All
USING (TRUE)                          -- Anyone can do this

-- Own data only
USING (auth.uid() = user_id)          -- Check BEFORE operation

-- Own data + extra checks
WITH CHECK (auth.uid() = user_id)     -- Check AFTER operation

-- Authenticated users only
WITH CHECK (auth.role() = 'authenticated' AND author = auth.uid())

-- Specific role
WITH CHECK (auth.jwt() ->> 'role' = 'admin')

-- Email domain check (advanced)
WITH CHECK (auth.jwt() ->> 'email' LIKE '%@example.com')
```

### FOR STORAGE POLICIES:

```sql
-- Any authenticated user
(bucket_id = 'avatars'::text)

-- Authenticated + own folder
(bucket_id = 'avatars'::text) AND 
((storage.foldername(name))[1] = auth.uid()::text)

-- Authenticated + specific file extension
(bucket_id = 'avatars'::text) AND 
(storage.filename(name) LIKE '%.jpg' OR storage.filename(name) LIKE '%.png')

-- Authenticated + size limit (if supported)
(bucket_id = 'avatars'::text) AND 
(storage.size(name) < 5242880) -- 5MB
```

---

## 6. COMMON PATTERNS

### Pattern 1: Public read, own write

```sql
-- SELECT: anyone can read
CREATE POLICY "Read all" ON table_name FOR SELECT USING (TRUE);

-- INSERT: authenticated user inserts own
CREATE POLICY "Insert own" ON table_name FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- UPDATE: only update own
CREATE POLICY "Update own" ON table_name FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: only delete own
CREATE POLICY "Delete own" ON table_name FOR DELETE 
USING (auth.uid() = user_id);
```

**Used in:** Your app (profiles readable by all, but edit own)

### Pattern 2: Completely private

```sql
-- SELECT: only own
CREATE POLICY "Read own" ON table_name FOR SELECT 
USING (auth.uid() = user_id);

-- INSERT: authenticated users
CREATE POLICY "Insert own" ON table_name FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- UPDATE: only own
CREATE POLICY "Update own" ON table_name FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: only own
CREATE POLICY "Delete own" ON table_name FOR DELETE 
USING (auth.uid() = user_id);
```

**Used in:** Private messages, personal data

### Pattern 3: Admin only

```sql
-- SELECT: admins only
CREATE POLICY "Read admin" ON table_name FOR SELECT 
USING (auth.jwt() ->> 'role' = 'admin');

-- INSERT: admins only
CREATE POLICY "Insert admin" ON table_name FOR INSERT 
WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```

**Used in:** Moderation, system tables

---

## 7. QUICK REFERENCE TABLE

| Operation | Table | Policy | Condition |
|-----------|-------|--------|-----------|
| Read profiles | profiles | SELECT | TRUE (anyone) |
| Insert profile | profiles | INSERT | auth.uid() = id |
| Update profile | profiles | UPDATE | auth.uid() = id |
| Delete profile | profiles | DELETE | auth.uid() = id |
| Read events | events | SELECT | TRUE (anyone) |
| Insert event | events | INSERT | auth.uid() = author AND authenticated |
| Update event | events | UPDATE | auth.uid() = author |
| Delete event | events | DELETE | auth.uid() = author |
| Upload avatar | avatars bucket | INSERT | folder[1] = auth.uid() |
| Upload image | event-images bucket | INSERT | folder[1] = auth.uid() |

---

## 8. TESTING YOUR POLICIES

### Test 1: Anonymous access
```javascript
// Should be able to read, not write
const { data: readAnon } = await supabase.from("events").select("*");
console.log("Anon read events:", readAnon); // ✓ Works

const { error: writeAnon } = await supabase.from("events").insert([...]);
console.log("Anon write event:", writeAnon); // ✗ Should fail
```

### Test 2: Own data
```javascript
// Should be able to read and write
const { data: readOwn } = await supabase
  .from("events")
  .select("*")
  .eq("author", user.id);
console.log("Read own events:", readOwn); // ✓ Works

const { error: writeOwn } = await supabase
  .from("events")
  .insert([{ author: user.id, title: "Test" }]);
console.log("Write own event:", writeOwn); // ✓ Works
```

### Test 3: Other's data
```javascript
// Should be able to read but not write
const { data: readOther } = await supabase
  .from("events")
  .select("*")
  .eq("author", someOtherId);
console.log("Read other events:", readOther); // ✓ Works (public)

const { error: writeOther } = await supabase
  .from("events")
  .insert([{ author: someOtherId, title: "Test" }]);
console.log("Write other event:", writeOther); // ✗ Should fail with RLS error
```

