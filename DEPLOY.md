# פריסת Think Twice לאוויר (Vercel) — לשיתוף עם בודקים

האפליקציה נפרסת כאתר סטטי + serverless proxy ששומר את מפתח ה-API **בסוד בצד שרת**.
הבודקים נכנסים דרך קישור בדפדפן (בלי חשבון Claude), עם סיסמת גישה משותפת.

## איך זה בנוי (לידיעה)
- `api/anthropic/[...path].js` — ה-proxy. מזריק את `ANTHROPIC_API_KEY` (סודי) ובודק `APP_PASSWORD`.
- הלקוח **לא** מכיל את המפתח. הוא רק שולח את סיסמת הגישה.
- `VITE_LIVE=1` מפעיל מצב חי; `VITE_REQUIRE_PASSWORD=1` מפעיל את שער הסיסמה.

---

## שלבים (פעם אחת)

### 1. מפתח Anthropic ייעודי עם תקרה 🔒
ב-[console.anthropic.com](https://console.anthropic.com) → **API Keys** → צור מפתח חדש ייעודי לבדיקות.
ב-**Limits / Usage** → הגדר **תקרת הוצאה חודשית** (למשל $20). כך גם אם הקישור דולף — ההפסד חסום.

### 2. חשבון Vercel
היכנס ל-[vercel.com](https://vercel.com) → **Sign up with GitHub** (חשבון `ranzak-ctrl`).

### 3. ייבוא הפרויקט
**Add New → Project** → בחר את הריפו `think-twice-app` → **Import**.
Vercel יזהה Vite אוטומטית (יש `vercel.json`).

### 4. משתני סביבה (Environment Variables) — לפני Deploy
הוסף את הארבעה:

| Name | Value | הערה |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` (המפתח מסעיף 1) | **סודי** |
| `APP_PASSWORD` | סיסמה שתבחר לבודקים | **סודי** |
| `VITE_LIVE` | `1` | |
| `VITE_REQUIRE_PASSWORD` | `1` | |

### 5. Deploy
לחץ **Deploy**. אחרי דקה תקבל כתובת כמו `https://think-twice-app.vercel.app`.

### 6. שתף עם הבודקים
- הקישור: `https://…vercel.app`
- הסיסמה: זו שהגדרת ב-`APP_PASSWORD`
- הבהרה מומלצת: *"פרוטוטייפ לבדיקה — אל תזינו מידע מזהה אמיתי."*

---

## עדכונים עתידיים
כל `git push` ל-GitHub → Vercel פורס מחדש אוטומטית. אין מה לעשות ידנית.

## פתרון תקלות
- **כל התשובות "מדומות"/לא אמיתיות** → ודא `VITE_LIVE=1` הוגדר.
- **401 / "שגיאה בחיבור למודל"** → הסיסמה שהוזנה ≠ `APP_PASSWORD`, או `ANTHROPIC_API_KEY` שגוי.
- **הכל עובד מקומית אבל לא בפרודקשן** → בדוק שכל 4 המשתנים הוגדרו ב-Vercel (לא ב-`.env`).
