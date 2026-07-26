# 🚧 נקודת עצירה — פריסה לאוויר (25.7.2026, ~00:15)

נעצרנו באמצע העלאת האפליקציה לאוויר לשיתוף עם בודקים. **הקוד תקין ודחוף; התקיעה היא בצד Vercel.**

---

## ✅ מה כבר עובד

- **האתר עלה:** https://think-twice-app.vercel.app — נטען, ו**שער הסיסמה עובד**.
- **פרויקט Vercel:** team `Think Twice` (Hobby) → פרויקט `think-twice-app`, מחובר ל-`ranzak-ctrl/think-twice-app`, ענף `main`.
- **4 משתני סביבה הוגדרו ב-Vercel** (Production+Preview):
  `ANTHROPIC_API_KEY` (סודי) · `APP_PASSWORD` (סודי — הערך אצל רן) · `VITE_LIVE=1` · `VITE_REQUIRE_PASSWORD=1`
- **חבילת בדיקות:** 319 ירוק. בנייה לפרודקשן עוברת מקומית.

## 🔴 התקלה הפתוחה

**כל קריאה ל-`/api/*` מחזירה 404** → האפליקציה מציגה "שגיאה בחיבור למודל".

שני ממצאים שאובחנו:

1. **הפרודקשן תקוע על קומיט ישן** — `3c1ba14`, ו-Vercel מסמנת אותו `Ready Stale`.
   הקומיטים הבאים נדחפו ל-GitHub אבל **לא נפרסו**:
   - `1b53343` — proxy בנתיב קבוע `api/anthropic/v1/messages.js` (החליף catch-all שלא נתפס) + `api/ping.js` לאבחון
   - `5ab9b63` — `vercel.json` מנוקה (הוסרו framework/buildCommand/outputDirectory) + מודל → `claude-sonnet-5`
2. **גם בפריסה הישנה לא נבנו serverless functions כלל** — בלוג הבנייה אין שום שלב של functions; תיקיית `api/` לא נבנתה.

אימות אחרון שבוצע: `/api/ping` → 404 · asset בפרודקשן `index-D1IQETBk.js` (ישן) · `age` ~43 דק'.

---

## ▶️ הצעד הבא כשממשיכים: פריסה ישירה מה-CLI

עוקף לגמרי את חיבור ה-Git ונותן לוג מלא שיגיד אם הפונקציות נבנות.

**רן מריץ (אינטראקטיבי, פעם אחת):**
```bash
cd ~/Projects/think-twice-app && npx vercel login
```
→ Continue with GitHub → אישור בדפדפן.

**ואז (Claude ממשיך):**
```bash
npx vercel link      # לקשר לפרויקט think-twice-app הקיים
npx vercel --prod    # פריסה ישירה של הקוד העדכני
```
ואז לאמת: `curl .../api/ping` → 200, ואז ה-proxy מול Anthropic עם `x-app-password`.

**אם גם זה לא בונה functions** — לבדוק ב-Vercel: Root Directory של הפרויקט, ולשונית Deployments (האם נוצרות פריסות חדשות בכלל / נכשלות).

---

## 📌 מידע טכני להמשך

- **ארכיטקטורת הפריסה:** הדפדפן קורא `POST /api/anthropic/v1/messages` **בלי מפתח**; הפונקציה בצד שרת מזריקה את `ANTHROPIC_API_KEY` ובודקת `x-app-password` מול `APP_PASSWORD`. המפתח אף פעם לא מגיע ללקוח (אומת: ה-bundle בפרודקשן קטן מהמקומי — בלי מפתח מוטמע).
- **מודל:** עודכן ל-`claude-sonnet-5` בשלושה מקומות — `src/adapters/model.js`, `src/core/judge.js`, `.env.example`. אפשר לעקוף עם `VITE_MODEL`.
- **מקומי לא נשבר:** `npm run dev` עדיין עובד עם המפתח מ-`.env` (הלקוח שולח אותו רק כשהוא תקין מקומית).
- **מדריך מלא:** [`DEPLOY.md`](DEPLOY.md).
- **גיבוי:** תגיות `backup-preconsolidation/*-20260725` (מקומי + GitHub) + חבילה מלאה ב-`~/Downloads/TT-migration-backup/think-twice-app-FULL-20260725.bundle`.

## ⚠️ לפני שמשתפים עם בודקים בפועל

- להחליף את `ANTHROPIC_API_KEY` ב**מפתח ייעודי עם תקרת הוצאה** (console.anthropic.com → Limits). כרגע מוגדר מפתח קיים.
- להוסיף לבודקים הבהרה: *"פרוטוטייפ לבדיקה — אל תזינו מידע מזהה אמיתי."*
