# ✅ מצב פריסה — חי באוויר (עודכן 14.8.2026)

האפליקציה רצה online ומוכנה לבודקים.

| | |
|---|---|
| **קישור** | https://think-twice-nine.vercel.app |
| **סיסמה** | ה-`APP_PASSWORD` שהוגדר ב-Vercel (הערך אצל רן) |
| **פרויקט Vercel** | team `think-twice1` → project `think-twice` |
| **Build חי** | `index-CncJa15i.js` |
| **בדיקות** | 323 עוברות (+1 מדולג) |

## אומת מקצה לקצה

- `/` → 200 · `/api/ping` → 200 (פונקציות serverless נבנות ✅)
- שער סיסמה: סיסמה שגויה → 401
- תור ראיון אמיתי → בלוק text יחיד, JSON נפרס, שאלה מעוגנת בסיפור
- `thinking_tokens: 0` — חשיבה כבויה
- **המפתח לא נמצא ב-bundle החי** — אומת ב-14.8 מול ה-URL הפומבי: `grep -c "sk-ant"` על `index-CncJa15i.js` מחזיר 0

## מה תוקן בדרך

1. **404 על `/api/*`** — פונקציית catch-all (`[...path].js`) לא נתפסה ע"י Vercel. הוחלפה בנתיב קבוע `api/anthropic/v1/messages.js`.
2. **`vercel.json`** — הוסרו `framework`/`buildCommand`/`outputDirectory` שגרמו לפריסה סטטית-בלבד (תיקיית `api/` לא נבנתה).
3. **`no_json` בכל תור חי** — `claude-sonnet-5` מריץ adaptive thinking כברירת מחדל ומחזיר בלוק `thinking` ראשון; הקוד קרא `content[0].text` וקיבל מחרוזת ריקה. עכשיו בוחר את בלוק הטקסט, ו-`thinking` כבוי. +1 בדיקת רגרסיה.
4. **מודל** → `claude-sonnet-5` (adapter · judge · `.env.example`).
5. **המפתח בצד לקוח (14.8)** — הקוד קרא `VITE_ANTHROPIC_API_KEY` דרך `import.meta.env`, כך שכל `npm run build` רגיל צרב את המפתח ל-bundle. הייצור לא נפגע — נוהל הפריסה הזיז את `.env` לפני הבנייה — אבל ההגנה הייתה **שלב ידני במסמך**, והוא היה הדבר היחיד שעמד בין המפתח לייצור. `isValidKey`, קריאת `VITE_ANTHROPIC_API_KEY` וכותרת `x-api-key` הוסרו; הדפדפן לא שולח מפתח באף סביבה. חי/מדומה נקבע עכשיו בדגל מפורש `VITE_USE_MOCK !== 'true'`.

## ⚠️ פתוח

**1. Vercel — פריסה שנייה ואילך נתקעת ב-`UNKNOWN`.**
דפוס שנצפה: פריסה ראשונה → `Ready` תוך ~5 שניות; כל פריסה אחריה נתקעת. קרה ב-`think-twice-app`, ב-`think-twice-live` וב-`think-twice`.

## ✅ נפתר (14.8.2026) — הסיבה: אימייל הקומיט

**הסיבה האמיתית, מתוך לוג ה-build של Vercel:**

> *The deployment was blocked because the commit email `<אימייל לא-מזוהה>` could not be matched to a GitHub account.*

ה-git המקומי היה מוגדר לאימייל שאינו מקושר ל-GitHub. Vercel מסרב לבנות קומיט שהמחבר שלו אינו מזוהה כחשבון GitHub — והוא לא מדווח על כך ל-CLI. הפריסה פשוט נתקעת ב-`UNKNOWN` בלי לוג ובלי שגיאה.

**למה זה הטעה כל כך הרבה זמן:**

| מסלול | מה קורה | תוצאה |
|---|---|---|
| `vercel deploy --prebuilt` | מעלה `.vercel/output` מוכן — **Vercel לא בונה** | ✅ עובר · אין בדיקת מחבר |
| `npx vercel --prod` | Vercel בונה בעצמו | ❌ נחסם על אימייל הקומיט |

כלומר נוהל הפריסה המתועד עבד **במקרה**: `--prebuilt` עקף את הבדיקה. הסימפטום `Builds: . [0ms]` היה באמת התנהגות תקינה של `--prebuilt`, אבל המסקנה שמסלול רגיל יעבוד הייתה שגויה — הוא נחסם מסיבה אחרת לגמרי.

גם ההשערה ש"תור בנייה סתום חוסם" הופרכה: אחרי מחיקת שלושת הפרויקטים המתים והסרת הפריסה התקועה, פריסה נקייה **עדיין** נחסמה.

**התיקון (בוצע):** אימייל git ברמת הריפו בלבד:

```bash
git config --local user.email "ranzak@gmail.com"
git config --local user.name  "Ran Zak"
```

ההגדרה הגלובלית של המכונה לא נגעה — ההחלפה חלה על הריפו הזה בלבד. ראה **"עיקרון ברזל — זהות הפרויקט"** ב-`CLAUDE.md`.

**חשוב:** הייצור לא נפגע באף שלב. Vercel ממשיך להגיש את הפריסה ה-`Ready` האחרונה. אומת: `/` → 200 · `/api/ping` → 200 · ה-bundle נקי ממפתח.

**2. ריבוי פרויקטים ב-Vercel — 6 עותקים של אותו מפתח.**
נוצרו 4 פרויקטים תחת `think-twice1`, כתוצאה מהעקיפה "צור פרויקט חדש" בכל פעם שפריסה נתקעה:

| פרויקט | עותקי `ANTHROPIC_API_KEY` | מצב |
|---|---|---|
| `think-twice` | 2 (Production + Preview) | **חי — לשמור** |
| `think-twice-app` | 2 | נטוש (25.7) · מוגן ב-Vercel SSO |
| `think-twice-live` | 2 | נטוש (1.8) · מוגן ב-Vercel SSO |
| `tt-probe` | 0 | קליפה ריקה |

שני הנטושים מחזירים 302 ל-`vercel.com/sso-api` ולא מגישים תוכן פומבי. **מומלץ:** למחוק את שלושת הפרויקטים המתים — זה מוריד 4 מ-6 עותקי המפתח ומסיים את בלבול השמות.

**3. מפתח API עם תקרה.** כרגע מוגדר המפתח הרגיל. צור מפתח ייעודי עם תקרת הוצאה (console.anthropic.com → Limits) והחלף ב-Vercel. אין עדות לחשיפה — הרוטציה היא היגיינה, לא חירום — אבל התקרה חשובה לפני שיתוף רחב.

**4. הבהרה לבודקים:** *"פרוטוטייפ לבדיקה — נא לא להזין מידע מזהה אמיתי."*

## נוהל פריסה

```bash
# 1. בדיקות + בנייה נקייה
npm test
npm run build
grep -c "sk-ant" dist/assets/*.js        # חייב 0

# 2. פריסה — המסלול הרגיל, בנייה בצד שרת
npx vercel --prod

# 3. אימות — חובה
curl -s -o /dev/null -w "%{http_code}\n" https://<url>/api/ping   # 200 = פונקציות עלו
curl -s https://<url>/assets/<bundle>.js | grep -c "sk-ant"       # 0 = אין מפתח בלקוח
```

> **הערה:** טריק `mv .env .env.bak` לפני הבנייה בוטל ואין להחזיר אותו. הוא היה דרוש רק כל עוד קוד הלקוח קרא `VITE_ANTHROPIC_API_KEY`; היום אין שום סוד עם קידומת `VITE_`, והבנייה בטוחה כברירת מחדל. `VITE_LIVE` הפך ל-no-op — המצב נקבע ע"י `VITE_USE_MOCK`.

**משתני סביבה נדרשים ב-Vercel** (Production + Preview): `ANTHROPIC_API_KEY` · `APP_PASSWORD` · `VITE_REQUIRE_PASSWORD=1`.

---

מדריך ההקמה המלא: [`DEPLOY.md`](DEPLOY.md) · מרכז העבודה: [`docs/workspace.html`](docs/workspace.html)
