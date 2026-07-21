// Signposting — verbal stage-transition messages (principle-zero §4.4).
// Positions the user on the map without asking "where to next?".
// Content, not code — Natali can revise these without touching logic.

// Keyed by the stage being ENTERED. Stage 5 is the "קו השינוי" — the pivot from
// mapping the automatic loop (1–4) to the change work (5–8).
export const SIGNPOST = {
  2: 'מיפינו את מה שקרה. עכשיו אני רוצה להבין איך אתה רואה את זה.',
  3: 'הבנו איך אתה רואה את זה. עכשיו בוא נראה מה הרגשת.',
  4: 'זיהינו את הרגש. עכשיו בוא נדבר על מה עשית ומה אתה שוקל לעשות.',
  5: 'יש לנו את התמונה — מה קרה, איך הבנת את זה, מה הרגשת ומה עשית. עכשיו אני רוצה להסתכל איתך רגע פנימה.',
  6: 'הבנו במה זה נגע. עכשיו בוא ננסה לראות את זה מנקודת מבט אחרת.',
  7: 'יש לנו תמונה רחבה יותר. בוא נחשוב מה עוד אפשר לעשות.',
  8: 'יש לנו אפשרויות על השולחן. הגיע הזמן לבחור.',
};

export function signpostForStage(stage) {
  return SIGNPOST[stage] ?? 'נמשיך.';
}
