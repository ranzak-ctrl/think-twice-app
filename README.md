# 🧠 Think Twice

אב-טיפוס לראיון טיפולי חצי-מובנה בן 7 שלבים למבוגרים עם ADHD — מאירוע סוער ועד הכרעה חדה.
React Artifact App · בלי שרת · Router דטרמיניסטי · שיתוף עם נטלי לוולידציה קלינית.

---

## 🏠 מרכז העבודה — התחל כאן

**[← פתח את מרכז העבודה: `docs/workspace.html`](docs/workspace.html)**

מבט-על אחד לכל הפרויקט: הוראות (CLAUDE.md + super-prompt), Context, Memory, Scheduled Tasks,
Connectors, שני הדשבורדים (ארכיטקטורה + לוח משימות), המסמכים והצ'אטים.

לפתיחה מהטרמינל:
```bash
open docs/workspace.html
```

---

## דשבורדים

- 🏗️ [דשבורד ארכיטקטורה](docs/architecture-dashboard.html) — ארכיטקטורה · זרימת-תור · צירי Router
- 🗂️ [לוח המשימות](docs/task-board.html) — הושלם · הבא · חוסמי שחרור · מוקפא

## הרצה

```bash
npm install
npm run dev      # אפליקציה על http://localhost:5173
npm test         # חבילת הבדיקות
```

## מבנה

- `src/core` — Router דטרמיניסטי (מכונת מצבים), StateDocument, promptBuilder, responseParser
- `src/safety` — שכבת בטיחות (אסור להסיר/להחליש)
- `src/content/prompts/` — פרומפטים (תוכן, לא קוד); `super-prompt-v1.md` = ה-instruction
- `docs/` — מסמכי מקור חיים (spec, פרוטוקול, dev-plan, gap-management, שאלות לנטלי)

מקור האמת המלא: [`CLAUDE.md`](CLAUDE.md).
