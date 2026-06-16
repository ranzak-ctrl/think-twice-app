// A representative completed "meat" interview, reaching a sharp decision +
// package test. Used by the LLM-judge integration test (and re-usable for manual
// acceptance runs). Plausible user answers, not mock-canned text.

export const meatTranscript = [
  {
    role: 'assistant',
    content:
      'אני אוביל אותך שלב-שלב. ההחלטה בסוף — שלך לגמרי. ספר לי — מה קרה?',
  },
  {
    role: 'user',
    content:
      'הזמנתי משלוח בשר למסעדה. כשהוא הגיע ראיתי שהוא לא באיכות שסיכמנו. אמרתי לספק שזה לא טוב, ופשוט עזבתי את המטבח באמצע המשמרת.',
  },
  { role: 'assistant', content: 'מי עוד היה שם באותו רגע?' },
  { role: 'user', content: 'הסו-שף והספק. שניהם הסתכלו עליי כשיצאתי.' },
  { role: 'assistant', content: 'ומה קרה מיד אחרי?' },
  { role: 'user', content: 'התקשרתי למנהל ואמרתי שאני לא חוזר היום. הוא לא הבין מה קרה.' },
  { role: 'assistant', content: 'למה לדעתך הספק הביא בשר כזה?' },
  { role: 'user', content: 'אולי חשב שלא אשים לב. כאילו אני לא מספיק מקצועי כדי להבחין.' },
  { role: 'assistant', content: 'ואיך אתה מבין את זה — מה זה אומר עליך, בעיניך?' },
  { role: 'user', content: 'שלא לוקחים אותי ברצינות. שאני לא מספיק טוב כדי שיתייחסו אליי כמו שצריך.' },
  { role: 'assistant', content: 'כשאתה מסתכל על התמונה הזו — איזה רגש זה מעורר?' },
  { role: 'user', content: 'עלבון. ממש עלבון עמוק.' },
  { role: 'assistant', content: 'כמה חזק, מ-1 עד 10?' },
  { role: 'user', content: 'שמונה. אולי תשע באותו רגע.' },
  { role: 'assistant', content: 'מזכיר לך משהו מהעבר?' },
  {
    role: 'user',
    content: 'כן. ככה הרגשתי כשמורים אמרו שאני לא משקיע, כשפשוט לא הצלחתי להתרכז.',
  },
  { role: 'assistant', content: 'באותו רגע — מה עשית, לפני שהספקת לחשוב?' },
  { role: 'user', content: 'פשוט קמתי ויצאתי. לא אמרתי מילה להסביר.' },
  { role: 'assistant', content: 'ומה אתה שוקל לעשות עכשיו?' },
  { role: 'user', content: 'אני לא יודע. חלק ממני רוצה פשוט להתפטר.' },
  { role: 'assistant', content: 'מה הספק ראה מהצד שלו באותו רגע?' },
  {
    role: 'user',
    content: 'כנראה ראה טבח שמתפוצץ עליו בלי הסבר. הוא אפילו לא ידע למה עזבתי.',
  },
  { role: 'assistant', content: 'נסה לנסח את זה במשפט שמתחיל ב"הוא..."' },
  {
    role: 'user',
    content: 'הוא ניסה לספק סחורה ולא הבין שהפר סיכום. הוא לא התכוון לזלזל בי.',
  },
  { role: 'assistant', content: 'כשאתה מסתכל על זה ככה — כמה חזק הרגש עכשיו, מ-1 עד 10?' },
  { role: 'user', content: 'ארבע. זה נרגע. זה כבר לא מרגיש אישי כמו קודם.' },
  { role: 'assistant', content: 'מה עוד אפשר לעשות במצב כזה?' },
  { role: 'user', content: 'לדבר איתו ישירות. להסביר מה הציפייה ולשמוע מה קרה אצלו.' },
  { role: 'assistant', content: 'לפני שנסתכל על האפשרויות — מה אתה בעצם רוצה שיקרה?' },
  { role: 'user', content: 'שאוכל לחזור למטבח בלי התחושה הזו, ושהבשר יגיע כמו שצריך.' },
  { role: 'assistant', content: 'הנה האפשרויות שאספנו, במילים שלך. במה אתה בוחר?' },
  { role: 'user', content: 'לדבר איתו ישירות. זה הכי נכון.' },
  { role: 'assistant', content: 'מה אתה מרוויח מהבחירה הזו, ומה אתה מוותר עליו?' },
  {
    role: 'user',
    content:
      'אני מרוויח יחסי עבודה תקינים ובשר טוב. אני מוותר על התחושה שניצחתי בלי להתעמת, וזה דורש ממני לחזור ולהיות פגיע קצת. אני מקבל את זה.',
  },
];
