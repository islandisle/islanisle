// Maldives runs on a fixed UTC+5 offset (Asia/Colombo — the same zone the
// backend's Open-Meteo calls use). "Night" here just drives header colour
// and the moon/sun weather glyph, not a real sunrise/sunset calculation —
// a 6pm–6am window matches the tropics closely enough (day length barely
// varies near the equator) without a sun-position library.
//
// Extracted from Home.jsx (Batch 27) so the shared AppShell top bar can use
// the same day/night colour as Home's header.
export function isMaldivesNight() {
  const maldivesHour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Colombo' }).format(new Date())
  );
  return maldivesHour >= 18 || maldivesHour < 6;
}
