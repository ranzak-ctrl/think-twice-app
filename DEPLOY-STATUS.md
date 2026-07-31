# ✅ מצב פריסה — חי באוויר (1.8.2026)

האפליקציה רצה online ומוכנה לבודקים.

| | |
|---|---|
| **קישור** | https://think-twice-nine.vercel.app |
| **סיסמה** | ה-`APP_PASSWORD` שהוגדר ב-Vercel (הערך אצל רן) |
| **פרויקט Vercel** | team `think-twice1` → project `think-twice` |
| **Build חי** | `index-CncJa15i.js` · מ-`main` |
| **בדיקות** | 320 עוברות (+1 מדולג) |

## אומת מקצה לקצה

- `/` → 200 · `/api/ping` → 200 (פונקציות serverless נבנות ✅)
- שער סיסמה: סיסמה שגויה → 401
- תור ראיון אמיתי → בלוק text יחיד, JSON נפרס, שאלה מעוגנת בסיפור
- `thinking_tokens: 0` — חשיבה כבויה
- **המפתח לא נמצא ב-bundle של הלקוח** (מוזרק בצד שרת ב-proxy)

## מה תוקן בדרך

1. **404 על `/api/*`** — פונקציית catch-all (`[...path].js`) לא נתפסה ע"י Vercel. הוחלפה בנתיב קבוע `api/anthropic/v1/messages.js`.
2. **`vercel.json`** — הוסרו `framework`/`buildCommand`/`outputDirectory` שגרמו לפריסה סטטית-בלבד (תיקיית `api/` לא נבנתה).
3. **`no_json` בכל תור חי** — `claude-sonnet-5` מריץ adaptive thinking כברירת מחדל ומחזיר בלוק `thinking` ראשון; הקוד קרא `content[0].text` וקיבל מחרוזת ריקה. עכשיו בוחר את בלוק הטקסט, ו-`thinking` כבוי (הזרימה רוצה JSON קומפקטי; thinking גם נספר מול `max_tokens`). +1 בדיקת רגרסיה.
4. **מודל** → `claude-sonnet-5` (adapter · judge · `.env.example`).

## ⚠️ פתוח

**1. Vercel — רק הפריסה הראשונה לכל פרויקט מסתיימת.**
דפוס מאומת: פריסה ראשונה → `Ready` תוך ~5 שניות; כל פריסה אחריה נתקעת ב-`UNKNOWN` לנצח (גם `--prebuilt`, גם אחרי ניקוי התור). קרה גם ב-`think-twice-app`, גם ב-`think-twice-live`, גם ב-`think-twice`. לא בעיה בקוד — לא היה שלב build בכלל (`Builds: . [0ms]`).

**עקיפה שעבדה:** יצירת פרויקט Vercel חדש + הגדרת 4 משתני הסביבה + `vercel deploy --prebuilt --prod`.
**לפני העדכון הבא:** לפנות לתמיכת Vercel, או לשקול מעבר ל-Netlify / Cloudflare Pages.

**2. מפתח API עם תקרה.** כרגע מוגדר המפתח הרגיל. לפני שיתוף רחב — צור מפתח ייעודי עם תקרת הוצאה (console.anthropic.com → Limits) והחלף ב-Vercel.

**3. הבהרה לבודקים:** *"פרוטוטייפ לבדיקה — נא לא להזין מידע מזהה אמיתי."*

## נוהל פריסה (עד שהתקלה נפתרת)

```bash
# 1. בנייה נקייה — בלי .env מקומי, אחרת המפתח נצרב ל-bundle
mv .env .env.bak && rm -rf .vercel/output
VITE_LIVE=1 VITE_REQUIRE_PASSWORD=1 VITE_MODEL=claude-sonnet-5 npx vercel build --prod --yes
grep -rl 'sk-ant-' .vercel/output/static/ && echo "LEAK — abort" || echo "clean"
mv .env.bak .env

# 2. פריסה
npx vercel deploy --prebuilt --prod --yes

# 3. אימות — חובה
curl -s -o /dev/null -w "%{http_code}\n" https://<url>/api/ping   # 200 = פונקציות עלו
```

אם הפריסה נתקעת ב-`UNKNOWN` — צור פרויקט חדש (`vercel project add <name>`), הגדר את 4 המשתנים, ופרוס אליו.

---

מדריך ההקמה המלא: [`DEPLOY.md`](DEPLOY.md) · מרכז העבודה: [`docs/workspace.html`](docs/workspace.html)
