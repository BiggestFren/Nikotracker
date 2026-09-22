const TIME_ZONE = 'America/New_York';
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const OPEN_MINUTES = 9 * 60 + 30;
const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
});
const offsetParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, timeZoneName: 'shortOffset',
});

function easternDate(date) {
  const parts = Object.fromEntries(dateParts.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(day, count) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + count * DAY).toISOString().slice(0, 10);
}

function easternTime(day, minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const utc = Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  const zone = offsetParts.formatToParts(new Date(utc)).find((part) => part.type === 'timeZoneName').value;
  const [, sign, hours, mins = '0'] = zone.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  const offset = (sign === '+' ? 1 : -1) * (Number(hours) * 60 + Number(mins));
  return new Date(utc - offset * MINUTE);
}

function nthWeekday(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + (weekday - first + 7) % 7 + 7 * (nth - 1);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0));
  return `${year}-${String(month).padStart(2, '0')}-${String(last.getUTCDate() - (last.getUTCDay() - weekday + 7) % 7).padStart(2, '0')}`;
}

function observed(day, saturdayObserved = true) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  if (weekday === 0) return addDays(day, 1);
  if (weekday === 6 && saturdayObserved) return addDays(day, -1);
  return day;
}

function goodFriday(year) {
  // Gregorian Easter, then two days back.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k + 7) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return addDays(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, -2);
}

function holidays(year) {
  return new Set([
    observed(`${year}-01-01`, false),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    goodFriday(year),
    lastWeekday(year, 5, 1),
    observed(`${year}-06-19`),
    observed(`${year}-07-04`),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observed(`${year}-12-25`),
  ]);
}

function session(day) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const year = Number(day.slice(0, 4));
  if (weekday === 0 || weekday === 6 || holidays(year).has(day)) return null;
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const early = day === addDays(thanksgiving, 1) || day === `${year}-07-03` || day === `${year}-12-24`;
  const open = easternTime(day, OPEN_MINUTES);
  const close = easternTime(day, early ? 13 * 60 : 16 * 60);
  const span = close.getTime() - open.getTime();
  const posts = Array.from({ length: 4 }, (_, index) => ({
    id: `regular-${index}`,
    at: new Date(Math.round((open.getTime() + span * index / 4) / MINUTE) * MINUTE),
  }));
  posts.push({ id: 'close-report', at: new Date(close.getTime() + 15 * MINUTE) });
  posts.push({ id: 'close-message', at: new Date(close.getTime() + 15 * MINUTE) });
  return { day, open, close, posts };
}

function nextOpen(now = new Date()) {
  const today = easternDate(now);
  for (let offset = 0; offset < 14; offset++) {
    const current = session(addDays(today, offset));
    if (current && current.open > now) return current.open;
  }
  throw new Error('Could not find the next U.S. trading session.');
}

function duePosts(now, completed = []) {
  const today = session(easternDate(now));
  if (!today) return [];
  return today.posts.filter(({ id, at }) =>
    !completed.includes(id) && now >= at && now.getTime() - at.getTime() <=
      (id.startsWith('regular-') ? 15 : 30) * MINUTE
  );
}

function nextPost(now, completed = []) {
  const today = session(easternDate(now));
  if (today) {
    const remaining = today.posts.find(({ id, at }) => !completed.includes(id) && at > now);
    if (remaining) return remaining.at;
  }
  return nextOpen(now);
}

function marketStatus(now = new Date()) {
  const today = session(easternDate(now));
  return today && now >= today.open && now < today.close ? 'open' : 'closed';
}

module.exports = { easternDate, session, nextOpen, duePosts, nextPost, marketStatus };
