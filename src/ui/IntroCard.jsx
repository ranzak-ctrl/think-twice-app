// Intro note — the one thing said before the interview starts.
//
// This began as a five-step "איך זה עובד" card. The stage rail made it
// redundant (Ran, 15.8): the rail carries the roadmap, permanently and in the
// authoritative seven steps, while the card restated it in five that did not
// match. The lead line went the same way — it repeated the opening turn, which
// already names the invitation.
//
// What survived is the only claim neither the rail nor the opener makes, and
// the one that matters most to someone deciding whether to type something
// painful into a browser: it stays in the browser. That is factually true of
// the architecture — no server-side storage, the proxy is a stateless
// pass-through — so it can be stated plainly rather than hedged.
//
// Kept deliberately quiet per design/brief.md: no border, no heading, no icon.
// It is a reassurance, not a feature to announce.

export default function IntroCard() {
  return (
    <p className="intro-note">
      אפשר לעצור בכל רגע. מה שנכתב כאן נשאר בדפדפן שלך ולא נשמר בשום מקום.
    </p>
  );
}
