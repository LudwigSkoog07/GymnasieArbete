# 📚 SUPABASE BUGFIX - DOKUMENTATION INDEX

## 🎯 START HÄR

### För snabb överblick (5 min läsning):
→ **[QUICK_START.md](QUICK_START.md)** - Kort sammanfattning + vad du gör nu

### För detaljerad förklaring av buggar:
→ **[BUGFIX_SUMMARY.md](BUGFIX_SUMMARY.md)** - Alla 4 buggar förklarade + varför de häntade

### För kod-ändringar:
→ **[CODE_PATCHES.md](CODE_PATCHES.md)** - Exakt kod för varje ändring

---

## 📖 INSTALLATION & SETUP

### Steg-för-steg instruktioner:
→ **[INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md)** - Detaljerad guide med:
- SQL setup
- Storage bucket creation
- Verification steps
- Troubleshooting för varje error

### SQL & RLS Policies:
→ **[SQL_SETUP.sql](SQL_SETUP.sql)** - Kör denna först i Supabase SQL Editor
- CREATE TABLE profiles
- CREATE TABLE events
- RLS policies (8 stycken)
- Storage bucket instructions

---

## 🔐 TEKNISK REFERENS

### RLS & Security:
→ **[RLS_POLICIES_REFERENCE.md](RLS_POLICIES_REFERENCE.md)** - Djupdykning i:
- Hur RLS fungerar
- Alla 8 policies förklarade
- Storage policies med `storage.foldername()`
- Troubleshooting med policy expressions
- Testning av RLS lokalt

---

## 🔄 ÄNDRADE FILER I DIN KOD

### JavaScript files:

1. **js/auth.js**
   - `signIn()` - Wrap ensureProfile i try/catch
   - `signUp()` - Same + better error messages
   - **Effekt:** Fixes "wrong password but logged in"

2. **js/guard.js**
   - `requireLogin()` - Add error handling + logging
   - **Effekt:** Better debugging

3. **js/profil.js**
   - `loadProfile()` - Use `.maybeSingle()` instead of `.single()`
   - `uploadAvatar()` - Detailed error logging
   - **Effekt:** Handles missing profiles, avatar errors

4. **js/laddaupp.js**
   - `uploadImages()` - Detailed error logging
   - Event submit handler - RLS policy error messages
   - **Effekt:** Shows exactly what's wrong

5. **js/events.js**
   - `loadEvents()` - Add error logging
   - **Effekt:** Better debugging

---

## 📊 TIMELINE

| What | When | Duration |
|------|------|----------|
| 1. Kör SQL_SETUP.sql | Nu | 5 min |
| 2. Skapa Storage buckets | Efter SQL | 5 min |
| 3. Verifiera setup | Efter buckets | 5 min |
| 4. Testa i app | Efter verify | 5 min |
| **Total** | | **20 min** |

---

## ✅ VERIFICATION CHECKLIST

Efter setup är klart:

### Database
- [ ] `SELECT * FROM public.profiles;` → returnerar något eller är tom (OK)
- [ ] `SELECT * FROM public.events;` → returnerar något eller är tom (OK)
- [ ] SQL Editor visar "profiles | true" och "events | true" (RLS ENABLED)

### Storage
- [ ] Supabase Dashboard → Storage → Du ser "avatars" bucket
- [ ] Du ser "event-images" bucket
- [ ] Varje bucket har 3 policies (INSERT, UPDATE, DELETE)

### App
- [ ] Kan skapa konto utan fel
- [ ] Kan ladda upp profilbild
- [ ] Kan ladda upp event
- [ ] Feed visar events
- [ ] Browser Console visar ✅ messages (ej errors)

---

## 🐛 BUGGAR - QUICK REFERENCE

| Bug | Symptom | Root Cause | Fix Location |
|-----|---------|-----------|--------|
| 1 | "Fel lösenord" men inloggad | ensureProfile() error visas | auth.js signIn() |
| 2 | Profiles skapas inte | `.single()` kastar error | profil.js loadProfile() |
| 3 | Avatar upload failar | Bucket/policies saknas | SQL_SETUP.sql + Storage |
| 4 | Event upload failar | RLS policy blockerar | SQL_SETUP.sql events policy |

---

## 🔍 ERROR DEBUGGING FLOWCHART

```
App visar error → Öppna Browser Console (F12)
                    ↓
         Vad säger error-meddelandet?
         
         ├→ "wrong password" men blir inloggad?
         │  → Check: BUGFIX_SUMMARY.md Bug 1
         │
         ├→ "table does not exist"
         │  → Check: Körde du SQL_SETUP.sql? Kör igen
         │
         ├→ "permission denied for schema public"
         │  → Check: js/supabaseClient.js använder ANON key?
         │
         ├→ "new row violates row-level security policy"
         │  → Check: RLS_POLICIES_REFERENCE.md troubleshooting
         │  → Check: Är du inloggad? Har du rätt author/user_id?
         │
         ├→ "Storage object not found" eller "The object does not exist"
         │  → Check: Bucket existerar? Bucket public? Policies?
         │
         └→ Något annat?
            → Kopiera hela error message
            → Search denna dokumentation
            → Om inte hittat → Last resort (INSTALLATION_GUIDE.md)
```

---

## 💡 TIPS FÖR GYMNASIEARBETE

### För presentationen:
1. **Säkerhet:** Förklara RLS policies - "databas-nivå access control"
2. **Architecture:** Visa flow: Frontend → Supabase (auth + DB + storage)
3. **Error handling:** Visa detaljerade error messages i console
4. **Testing:** Live-demo: skapa konto → upload → feed

### För rapporten:
1. Förklara vad RLS är (lite teknik, mycket kontext)
2. Visa SQL för policies (inte all kod, bara policies)
3. Diskutera: Varför är säkerhet viktigt?
4. Resultat: Alla 4 buggar fixade

### För koden:
1. Kommentera error-handling: "Här hanterar vi RLS errors"
2. Kommentera RLS logic: "author = auth.uid() - bara eget"
3. Kommentera try/catch: "Visa Supabase error, inte generisk text"

---

## 📞 SNABB FAQ

**F: Varifrån kopierar jag SQLen?**
A: Från `SQL_SETUP.sql` - kopiera ALLT, klistra in i Supabase SQL Editor

**F: Vad om jag redan har tables/buckets?**
A: Du kan köra SQL_SETUP.sql ändå - det hanterar duplicates

**F: Kan jag testa utan att deploy?**
A: Ja - bara öppna app locally, öppna Browser Console, testa

**F: Vad är RLS?**
A: Row Level Security - databaskontroll som säger vem som kan läsa/skriva vilken rad

**F: Vad är storage policies?**
A: Samma men för filer/bilder - begränsar mappstruktur per user

**F: Varför `.maybeSingle()` istället för `.single()`?**
A: `.single()` kastar error om ingen rad finns. `.maybeSingle()` returnerar null. Bättre error handling.

**F: Hur testar jag att RLS fungerar?**
A: Försök insertera event med `author = other_user_id` - ska faila med RLS error

---

## 🎓 TEKNISKA KONCEPT FÖRKLARADE

### auth.uid()
- Supabase funktion som returnerar din authenticated user ID (UUID)
- Returna NULL om du inte är inloggad
- Använd i RLS policies: `WITH CHECK (auth.uid() = id)`

### Foreign Key (FK)
- `events.author` är en FK som pekar på `profiles.id`
- Databas-nivå integritet: kan inte inserera event utan valid profile
- Kräver att `profiles.id` redan existerar

### RLS Policy "WITH CHECK"
- AFTER operation - checkar att data är OK före insert/update
- `INSERT { id: 123 }` → RLS checkar: `123 = auth.uid()`?
- Om false → RLS error

### storage.foldername(name)
- Supabase funktion som extraherar path-delen
- `events/uuid/2025/file.jpg` → `["events", "uuid", "2025", "file.jpg"]`
- `[1]` = andra element = `"uuid"`

---

## 🚀 NÄSTA STEG EFTER SETUP

1. **Läs BUGFIX_SUMMARY.md** - Förstå varje bug
2. **Kör INSTALLATION_GUIDE.md** - Steg för steg
3. **Testa i appen** - Verifiera allt fungerar
4. **Läs RLS_POLICIES_REFERENCE.md** - Fördjupning om säkerhet
5. **Skapa en enkel test-case** - Screenshots för gymnasiearbetet

---

## 📋 DOKUMENTATION STRUCTURE

```
Root: c:\Users\ludwi\Programering\GymnasieArbete\

├── 📄 QUICK_START.md (DU ÄR HÄR)
├── 📄 BUGFIX_SUMMARY.md (Alla buggar förklarade)
├── 📄 CODE_PATCHES.md (Exakt kod per fil)
├── 📄 INSTALLATION_GUIDE.md (Steg-för-steg)
├── 📄 RLS_POLICIES_REFERENCE.md (Teknisk djupdykning)
├── 📄 SQL_SETUP.sql (← Kör denna först!)
│
├── html/
│   ├── Auth.html
│   ├── Hem.html
│   ├── Profil.html
│   └── LaddaUp.html
│
└── js/
    ├── supabaseClient.js (✓ Ändrad)
    ├── auth.js (✓ Ändrad)
    ├── guard.js (✓ Ändrad)
    ├── profil.js (✓ Ändrad)
    ├── laddaupp.js (✓ Ändrad)
    ├── events.js (✓ Ändrad)
    └── Main.js
```

---

## ✨ LYCKA TILL!

Du är nu redo att:
1. Köra SQL setup
2. Skapa storage buckets
3. Testa din app
4. Leverera ett robust gymnasiearbete!

Frågor? Kolla relevant .md fil i index-listan ovan! 🚀

