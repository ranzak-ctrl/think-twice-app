// Signposting — verbal stage-transition messages (principle-zero §4.4).
// Positions the user on the map without asking "where to next?".
// Content, not code — Natali can revise these without touching logic.

export const SIGNPOST = {
  2: 'מיפינו את מה שקרה. עכשיו אני רוצה להבין איך אתה רואה את זה.',
  3: 'הבנו איך אתה רואה את זה. עכשיו בוא נראה מה הרגשת.',
  4: 'זיהינו את הרגש. עכשיו בוא נדבר על מה עשית ומה אתה שוקל לעשות.',
  5: 'הבנו את התגובה. עכשיו בוא ננסה לראות את זה מנקודת מבט אחרת.',
  6: 'יש לנו תמונה רחבה יותר. בוא נחשוב מה עוד אפשר לעשות.',
  7: 'יש לנו אפשרויות על השולחן. הגיע הזמן לבחור.',
};

export function signpostForStage(stage) {
  return SIGNPOST[stage] ?? 'נמשיך.';
}
