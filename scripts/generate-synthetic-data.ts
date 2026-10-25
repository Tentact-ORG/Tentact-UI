/**
 * Synthetic Lead Dataset Generator for ClickHouse.
 *
 * Generates reproducible companies, contacts and unapproved raw events with real-world
 * edge cases (nulls, multiple contacts per company, restricted columns, arrays, varied
 * ranges). Uses a bit-exact port of CPython's `random` module, so seed 42 reproduces
 * the committed database/synthetic_seed_data.json byte-for-byte.
 *
 * Usage: npm run generate-data [-- --companies 250 --out database/synthetic_seed_data.json]
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const RANDOM_SEED = 42;

/** CPython's Mersenne Twister (MT19937) and the `random` helpers this generator uses. */
class PythonRandom {
  private readonly mt = new Uint32Array(624);
  private index = 625;

  constructor(seed: number) {
    this.initByArray([seed >>> 0]);
  }

  private initGenrand(s: number): void {
    this.mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
      this.mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.index = 624;
  }

  private initByArray(key: number[]): void {
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    for (let k = Math.max(624, key.length); k > 0; k--) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
      this.mt[i] = ((this.mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0;
      i++;
      j++;
      if (i >= 624) {
        this.mt[0] = this.mt[623];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = 623; k > 0; k--) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
      this.mt[i] = ((this.mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= 624) {
        this.mt[0] = this.mt[623];
        i = 1;
      }
    }
    this.mt[0] = 0x80000000;
  }

  private genrandUint32(): number {
    if (this.index >= 624) {
      for (let kk = 0; kk < 624; kk++) {
        const y = (this.mt[kk] & 0x80000000) | (this.mt[(kk + 1) % 624] & 0x7fffffff);
        this.mt[kk] = this.mt[(kk + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = this.mt[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  random(): number {
    const a = this.genrandUint32() >>> 5;
    const b = this.genrandUint32() >>> 6;
    return (a * 67108864 + b) * (1 / 9007199254740992);
  }

  private getrandbits(k: number): number {
    return this.genrandUint32() >>> (32 - k);
  }

  private randbelow(n: number): number {
    const k = n.toString(2).length;
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  randint(a: number, b: number): number {
    return a + this.randbelow(b - a + 1);
  }

  uniform(a: number, b: number): number {
    return a + (b - a) * this.random();
  }

  choice<T>(seq: readonly T[]): T {
    return seq[this.randbelow(seq.length)];
  }

  /** random.sample for small populations (CPython's pool-based branch). */
  sample<T>(population: readonly T[], k: number): T[] {
    const n = population.length;
    const setsize = 21 + (k > 5 ? 4 ** Math.ceil(Math.log(k * 3) / Math.log(4)) : 0);
    if (n > setsize) throw new Error("PythonRandom.sample only implements the pool branch");
    const pool = [...population];
    const result: T[] = [];
    for (let i = 0; i < k; i++) {
      const j = this.randbelow(n - i);
      result.push(pool[j]);
      pool[j] = pool[n - i - 1];
    }
    return result;
  }
}

const INDUSTRIES = ["SaaS", "Fintech", "Healthcare", "Cybersecurity", "E-commerce", "Edtech", "CleanTech", "AI/ML", "DevOps", "BioTech"];
const COUNTRIES = ["United States", "United Kingdom", "Germany", "Canada", "France", "Australia", "Japan", "India", "Singapore"];
const CITIES_BY_COUNTRY: Record<string, string[]> = {
  "United States": ["San Francisco", "New York", "Austin", "Seattle", "Boston"],
  "United Kingdom": ["London", "Manchester", "Cambridge"],
  Germany: ["Berlin", "Munich", "Frankfurt"],
  Canada: ["Toronto", "Vancouver", "Montreal"],
  France: ["Paris", "Lyon"],
  Australia: ["Sydney", "Melbourne"],
  Japan: ["Tokyo", "Osaka"],
  India: ["Bengaluru", "Mumbai", "Hyderabad"],
  Singapore: ["Singapore"],
};
const TECH_STACK_POOL = [
  "React", "Python", "TypeScript", "AWS", "ClickHouse", "PostgreSQL", "Docker", "Kubernetes", "Snowflake",
  "Kafka", "Salesforce", "HubSpot", "Stripe", "Next.js", "FastAPI", "GCP", "GraphQL", "Redis",
];
const JOB_TITLES: Array<[string, string, string]> = [
  ["Chief Technology Officer", "C-Level", "Engineering"],
  ["VP of Sales", "VP", "Sales"],
  ["Head of Marketing", "Director", "Marketing"],
  ["Senior Software Engineer", "Senior", "Engineering"],
  ["Director of RevOps", "Director", "Operations"],
  ["Chief Executive Officer", "C-Level", "Executive"],
  ["Product Manager", "Manager", "Product"],
  ["Data Architect", "Senior", "Engineering"],
  ["Sales Development Representative", "Entry", "Sales"],
  ["VP of Product", "VP", "Product"],
];
const FIRST_NAMES = [
  "Alex", "Jordan", "Taylor", "Morgan", "Sam", "Chris", "Pat", "Avery", "Elena", "Marcus", "Priya", "Chen",
  "Liam", "Sophie", "Noah", "Olivia", "Hiroshi", "Fatima", "Mateo", "Ananya",
];
const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Garcia", "Rodriguez", "Martinez",
  "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
];
const FUNDING_STAGES = ["Seed", "Series A", "Series B", "Series C", "Public", "Bootstrapped", null];

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const formatTimestamp = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const daysBefore = (base: Date, days: number) => new Date(base.getTime() - days * 86_400_000);
const round2 = (x: number) => Number(x.toFixed(2));

export function generateDataset(numCompanies = 200, minContactsPerCo = 2, maxContactsPerCo = 6) {
  const rng = new PythonRandom(RANDOM_SEED);
  const companies: Record<string, unknown>[] = [];
  const contacts: Record<string, unknown>[] = [];
  const unapprovedEvents: Record<string, unknown>[] = [];
  let contactIdSeq = 10001;
  let eventIdSeq = 50001;
  const baseTime = new Date(Date.UTC(2025, 0, 1, 12, 0, 0));

  for (let i = 1; i <= numCompanies; i++) {
    const coId = 1000 + i;
    const industry = rng.choice(INDUSTRIES);
    const country = rng.choice(COUNTRIES);
    const city = rng.choice(CITIES_BY_COUNTRY[country]);
    const domain = `enterprise${pad(i, 3)}.io`;

    let employees: number;
    let revenue: number;
    if (i % 10 === 0) {
      employees = rng.randint(5000, 45000); // giant enterprise
      revenue = round2(employees * rng.uniform(150000, 300000));
    } else if (i % 3 === 0) {
      employees = rng.randint(250, 2000); // mid-market
      revenue = round2(employees * rng.uniform(100000, 220000));
    } else {
      employees = rng.randint(10, 200); // early/growth
      revenue = round2(employees * rng.uniform(80000, 180000));
    }

    const technologies = rng.sample(TECH_STACK_POOL, rng.randint(3, 8)).sort();
    const funding = rng.choice(FUNDING_STAGES);
    const foundedYear = rng.randint(2005, 2024);
    const confidentialArr = rng.random() > 0.3 ? revenue * 0.85 : null; // RESTRICTED column
    const createdAt = formatTimestamp(daysBefore(baseTime, rng.randint(1, 365)));

    companies.push({
      company_id: coId,
      name: `Enterprise-${pad(i, 3)} ${industry.replaceAll("/", "")}`,
      domain,
      industry,
      country,
      city,
      employee_count: employees,
      annual_revenue_usd: revenue,
      technologies,
      funding_stage: funding,
      founded_year: foundedYear,
      confidential_arr: confidentialArr,
      created_at: createdAt,
    });

    const numContacts = rng.randint(minContactsPerCo, maxContactsPerCo);
    for (let c = 0; c < numContacts; c++) {
      const first = rng.choice(FIRST_NAMES);
      const last = rng.choice(LAST_NAMES);
      const [title, seniority, dept] = rng.choice(JOB_TITLES);
      const directPhone =
        rng.random() > 0.4
          ? `+1-${rng.randint(200, 999)}-${rng.randint(200, 999)}-${rng.randint(1000, 9999)}`
          : null; // RESTRICTED column
      const linkedin = rng.random() > 0.2 ? `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${rng.randint(10, 99)}` : null;
      const isVerified = rng.random() > 0.15 ? 1 : 0;
      const contactCreated = formatTimestamp(daysBefore(baseTime, rng.randint(1, 180)));
      contacts.push({
        contact_id: contactIdSeq++,
        company_id: coId,
        first_name: first,
        last_name: last,
        full_name: `${first} ${last}`,
        job_title: title,
        seniority_level: seniority,
        department: dept,
        work_email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`,
        direct_phone: directPhone,
        country,
        linkedin_url: linkedin,
        is_verified: isVerified,
        created_at: contactCreated,
      });
    }

    if (rng.random() > 0.5) {
      const eventType = rng.choice(["page_view", "demo_requested", "whitepaper_download"]);
      const score = rng.randint(10, 95);
      unapprovedEvents.push({
        event_id: eventIdSeq++,
        company_id: coId,
        event_type: eventType,
        // Python json.dumps formatting
        raw_payload: `{"source": "campaign_2025", "score": ${score}}`,
        event_time: formatTimestamp(baseTime),
      });
    }
  }
  return { companies, contacts, unapproved_events: unapprovedEvents };
}

const FLOAT_FIELDS = new Set(["annual_revenue_usd", "confidential_arr"]);
const FLOAT_MARKER = "\u0000float:";

/** json.dump(indent=2) output, including Python's "1.0" rendering of integral floats. */
function toPythonJson(data: unknown): string {
  const text = JSON.stringify(
    data,
    (key, value) =>
      FLOAT_FIELDS.has(key) && typeof value === "number" && Number.isInteger(value) ? `${FLOAT_MARKER}${value}.0` : value,
    2,
  );
  return text.replace(/"\\u0000float:([^"]+)"/g, "$1");
}

function main(): void {
  const { values } = parseArgs({
    options: {
      companies: { type: "string", default: "250" },
      out: { type: "string", default: path.join("database", "synthetic_seed_data.json") },
    },
  });
  const numCompanies = Number(values.companies);
  if (!Number.isInteger(numCompanies) || numCompanies < 1) throw new Error("--companies must be a positive integer");

  const data = generateDataset(numCompanies);
  console.log(
    `Generated ${data.companies.length} companies, ${data.contacts.length} contacts, ${data.unapproved_events.length} raw events.`,
  );
  fs.writeFileSync(values.out!, toPythonJson(data));
  console.log(`Saved to ${values.out}`);
}

main();
