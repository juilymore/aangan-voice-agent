// Spoken IST times for the voice agent, e.g. "Thursday the ninth, at eleven in the morning".
// Words, not digits, so the agent never reads out numbers that could sound like prices.

const ORD = [
  "", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth",
  "nineteenth", "twentieth", "twenty-first", "twenty-second", "twenty-third", "twenty-fourth", "twenty-fifth",
  "twenty-sixth", "twenty-seventh", "twenty-eighth", "twenty-ninth", "thirtieth", "thirty-first",
];
const HOURS = ["twelve", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** IST wall-clock parts of a UTC instant. */
export function istParts(d: Date) {
  const t = new Date(d.getTime() + 330 * 60_000);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate(), wd: t.getUTCDay(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
}

export function spokenTime(start: Date, now: Date = new Date()): string {
  const p = istParts(start);
  const n = istParts(now);
  const h12 = HOURS[p.h % 12];
  const part = p.h < 12 ? "in the morning" : p.h < 17 ? "in the afternoon" : "in the evening";
  const clock = p.mi === 0 ? `${h12} ${part}` : p.mi === 30 ? `half past ${h12} ${part}` : `${h12} ${p.mi} ${part}`;
  const sameMonth = p.mo === n.mo && p.y === n.y;
  const day = `${WEEKDAYS[p.wd]} the ${ORD[p.d]}${sameMonth ? "" : ` of ${MONTHS[p.mo]}`}`;
  return `${day}, at ${clock}`;
}
