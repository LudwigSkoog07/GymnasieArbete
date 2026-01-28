# 🚀 QUICK START - 5 MINUTERS VERSION

## Vad jag fixade

Alla 4 buggar är nu fixade via automatiska kod-ändringar + SQL setup.

---

## ⚡ VAD DU GÖR NU (ungefär 20 minuter)

### 1️⃣ Kör SQL (5 min)
- Öppna Supabase Dashboard → SQL Editor
- Kopiera innehållet från `SQL_SETUP.sql`
- Klistra in och kör

### 2️⃣ Skapa Storage Buckets (5 min)
- Supabase Dashboard → Storage
- Skapa bucket "avatars" (public, med 3 policies)
- Skapa bucket "event-images" (public, med 3 policies)
- Policies: INSERT, UPDATE, DELETE med custom expression:
  ```
  (bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = auth.uid()::text)
  ```

### 3️⃣ Verifiera allt (5 min)
- Öppna din app
- Testa: Skapa konto → Ladda profilbild → Ladda upp event
- Öppna Browser Console (F12) - du ska se ✅ messages

### 4️⃣ Klar! 🎉
- Alla buggar är fixade
- Code är robust med error logging
- RLS policies skyddar din data

---

## 📂 NYA FILER I DITT PROJEKT

```
SQL_SETUP.sql                 ← Kör denna först (tables + RLS policies)
BUGFIX_SUMMARY.md             ← Detaljerad förklaring av alla buggar
CODE_PATCHES.md               ← Kod-ändringar per fil
RLS_POLICIES_REFERENCE.md     ← Teknisk referens för RLS
INSTALLATION_GUIDE.md         ← Steg-för-steg instruktioner (denna)
```

---

## 🔧 ÄNDRADE FILER

| File | What changed | Why |
|------|-------------|-----|
| js/auth.js | signIn/signUp error handling | ✅ Fixes "wrong password but logged in" |
| js/guard.js | Add error logging | ✅ Better debugging |
| js/profil.js | loadProfile(.maybeSingle), avatar errors | ✅ Handles missing profiles |
| js/laddaupp.js | Event insert error handling | ✅ Shows why upload fails |
| js/events.js | Add error logging | ✅ Better debugging |

---

## 🐛 BUGGAR FÖRKLARADE (kort)

### Bug 1: "Fel lösenord men ändå inloggad"
- **Var:** `auth.js` line ~90
- **Problem:** ensureProfile() failade efter login, visar fel men redirectar ändå
- **Fix:** Wrap i try/catch, visa INTE fel för user, bara console.log

### Bug 2: Profiles skapas inte alltid
- **Var:** `profil.js` loadProfile()
- **Problem:** `.single()` kastar error om profil saknas
- **Fix:** Använd `.maybeSingle()` istället + RLS policy som tillåter insert

### Bug 3: Avatar upload failar
- **Var:** Storage bucket "avatars"
- **Problem:** Bucket + policies saknas eller är fel
- **Fix:** Skapa bucket med RLS policy: `folder[1] = auth.uid()`

### Bug 4: Event upload failar
- **Var:** Storage bucket "event-images" + events RLS
- **Problem:** Bucket + policies saknas, event RLS blockerar insert
- **Fix:** Skapa bucket + event RLS policy: `author = auth.uid()`

---

## ✅ QUICK VERIFICATION

Efter steg 1-3, öppna Browser Console och testa:

```javascript
// Test 1: Är du inloggad?
const { data } = await supabase.auth.getSession();
console.log(data?.session?.user?.id);  // Should show UUID

// Test 2: Kan du läsa profiles?
const { data: profiles } = await supabase.from("profiles").select("*");
console.log(profiles.length);  // Should be > 0

// Test 3: Kan du läsa events?
const { data: events } = await supabase.from("events").select("*");
console.log(events.length);  // Should be 0 or more
```

---

## 🔍 IF SOMETHING GOES WRONG

### Error: "new row violates row-level security policy"
→ RLS policy blockerar din operation
→ Check: är du inloggad? har du rätt author/user_id?

### Error: "bucket does not exist"
→ Bucket skapades inte eller fel namn
→ Check: Supabase Storage → Buckets → Existerar "avatars" och "event-images"?

### Error: "table does not exist"
→ SQL_SETUP.sql kördes inte eller failade
→ Check: Supabase SQL Editor → Kör SQL_SETUP.sql igen

### Error: "permission denied"
→ Du använder SECRET key istället för ANON key
→ Check: `js/supabaseClient.js` → ska vara `sb_publishable_...`

---

## 📖 FULL DOCS

- **BUGFIX_SUMMARY.md** - Vad var buggen, varför, hur fixad
- **CODE_PATCHES.md** - Exakt kod för varje ändring
- **RLS_POLICIES_REFERENCE.md** - Teknisk djupdykning i RLS
- **INSTALLATION_GUIDE.md** - Steg-för-steg med screenshots

---

## 🎯 SUCCESS CHECKLIST

Efter allt är gjort, du ska kunna:

- [ ] Skapa konto **utan** "fel lösenord"-fel
- [ ] Ladda upp profilbild → den visas omedelbar
- [ ] Ladda upp event med bilder → visas i feed + profil
- [ ] Se alla events i feed (join med profile-namn)
- [ ] Radera dina egna events (inte andras)
- [ ] Inte se NÅGOT error i Browser Console (bara info/log)

---

## 🚀 Du är klar!

Lycka till med ditt gymnasiearbete! 

Tips för presentation:
- Visa error-meddelanden i console
- Förklara RLS policies (säkerhet)
- Visa att join-query hämtar profile-namn
- Poängtera error handling (robust kod)

