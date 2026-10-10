// Qualification constants. Source of truth: docs/functional_design.md (stands in for qualification_logic.md).
// SERVER ONLY: pricing numbers and thresholds must never reach Vaani, a caller, or the browser.
import "server-only";

// --- Criterion 3: timeline (functional_design §7.3 row 3, §7.5; qualified.md §3; Q2) ---
/** Completion needed sooner than this is impossible (FAIL). */
export const MIN_WEEKS_TO_COMPLETION = 8;
/** Completion within this many weeks passes but is flagged tight_timeline (§7.5). */
export const TIGHT_TIMELINE_WEEKS = 16;
/** Start this many days or more out passes but is flagged late_start (§7.5, Q2b; F06 ≈ 4.5 months). */
export const LATE_START_DAYS = 120;

// --- Exclusions: commercial size (functional_design §7.4; services.md "up to approximately 3,000 sq ft"; T18; Q3) ---
export const COMMERCIAL_MIN_SQFT = 500;
/** Above this: needs_review, never a fail. */
export const COMMERCIAL_MAX_SQFT = 3000;

// --- Criterion 4: budget floor (functional_design §7.6; pricing.md) ---
/** pricing.md: Residential standard specification ₹1,800–₹2,400 per sq ft → lowest. */
export const RESIDENTIAL_FLOOR_PER_SQFT = 1800;
/** pricing.md: Commercial basic fitout ₹1,200–₹1,800 per sq ft → lowest. */
export const COMMERCIAL_FLOOR_PER_SQFT = 1200;
/** pricing.md: Single room redesign (all-in) ₹3.5 lakh – ₹8 lakh → lowest. */
export const SINGLE_ROOM_FLOOR = 350_000;
/** Conservative carpet area when only BHK is known (§7.6 assumption). */
export const ASSUMED_CARPET_SQFT_BY_BHK: Record<number, number> = { 1: 400, 2: 600, 3: 850, 4: 1200, 5: 1600 };
/** "Clearly below": stated maximum < this × floor → FAIL. Between this and 1.0 → budget_tight (§7.6). */
export const BUDGET_FAIL_RATIO = 0.6;

// --- Temperature (functional_design §7.7) ---
export const TEMPERATURE_POINTS = {
  consultIntent: 2,
  referral: 1,
  soon: 1, // start within SOON_DAYS, "now / immediately / as soon as possible", or a meeting wanted within 7 days
  commitment: 1,
  clearScopeAndSize: 1,
  exploring: -2,
  priceOnly: -1,
  noRushToDecide: -1,
} as const;
export const SOON_DAYS = 90;
export const HOT_MIN_SCORE = 4;
export const WARM_MIN_SCORE = 1;

// --- Criterion 2: service area (functional_design §7.4; services.md; Q4) ---
// Matching is case-insensitive "contains". FAIL terms are checked first ("Talegaon, near Pune" fails).
// Anything on neither list is UNCLEAR → needs_review, never a decline.
export const AREA_FAIL_TERMS = [
  "talegaon", "lonavala", "lonavla", "nashik", "mumbai", "thane", "navi mumbai", "satara", "kolhapur",
  "nagpur", "aurangabad", "bangalore", "bengaluru", "hyderabad", "delhi", "goa", "lavasa",
];
export const AREA_PASS_TERMS = [
  // services.md, Pune city
  "kothrud", "baner", "aundh", "wakad", "koregaon park", "kalyani nagar", "viman nagar", "hadapsar",
  "magarpatta", "nibm", "kondhwa", "undri", "shivane", "warje", "erandwane", "deccan",
  // services.md, PCMC
  "pimpri", "chinchwad", "pimple saudagar", "pimple nilakh", "ravet", "hinjewadi", "pcmc",
  // "adjoining areas" (Q4 default; extend when Nikhil confirms)
  "kharadi", "nanded city", "bavdhan", "balewadi", "pashan", "sus road", "sinhagad road", "dhanori",
  "yerawada", "yerwada", "wanowrie", "camp", "shivajinagar", "model colony", "prabhat road", "sahakar nagar",
  "katraj", "bibwewadi", "mundhwa", "keshav nagar", "wadgaon sheri", "kalyani", "salunke vihar",
  "akurdi", "nigdi", "bhosari", "pimple gurav", "thergaon", "punawale", "tathawade", "rahatani",
  "kasarwadi", "pimple", "cybercity", "sunderban",
];
