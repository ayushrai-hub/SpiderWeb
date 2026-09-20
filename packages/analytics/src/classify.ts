import type { Confidence, TrustLevel } from './types.js';

export interface Classification {
  key: string;
  label: string;
  confidence: Confidence;
  trust: TrustLevel;
  evidence: string;
}

export const INDUSTRIES: Record<string, string> = {
  ai: 'AI / machine learning',
  software: 'Software',
  cybersecurity: 'Cybersecurity',
  fintech: 'Fintech',
  finance: 'Finance',
  healthcare: 'Healthcare',
  biotech: 'Biotech / life sciences',
  consulting: 'Consulting',
  education: 'Education',
  government: 'Government',
  media: 'Media',
  manufacturing: 'Manufacturing',
  energy: 'Energy',
  retail: 'Retail / consumer',
  telecom: 'Telecom',
  legal: 'Legal',
  real_estate: 'Real estate',
  hardware: 'Hardware / semiconductors',
  recruiting: 'Recruiting / HR',
  nonprofit: 'Nonprofit',
};

export const ROLE_FAMILIES: Record<string, string> = {
  engineering: 'Engineering',
  data: 'Data / ML',
  product: 'Product',
  design: 'Design',
  sales: 'Sales',
  marketing: 'Marketing',
  operations: 'Operations',
  finance: 'Finance',
  legal: 'Legal',
  hr: 'People / HR',
  research: 'Research',
  customer: 'Customer / support',
  leadership: 'General leadership',
  founder: 'Founder',
};

export const SENIORITY: Record<string, string> = {
  intern: 'Intern',
  junior: 'Junior',
  senior: 'Senior',
  staff: 'Staff / principal',
  manager: 'Manager',
  director: 'Director',
  vp: 'VP / SVP',
  c_level: 'C-level',
  founder: 'Founder / owner',
};

const COMPANY_INDUSTRY: Array<[RegExp, string]> = [
  [
    /\b(openai|anthropic|huggingface|hugging face|mistral ai|cohere|stability ai|midjourney|scale ai|perplexity)\b/,
    'ai',
  ],
  [
    /\b(stripe|adyen|plaid|wise|revolut|chime|robinhood|coinbase|klarna|checkout\.com|paypal|square|block)\b/,
    'fintech',
  ],
  [
    /\b(goldman|jpmorgan|jp morgan|morgan stanley|blackrock|bridgewater|citadel|two sigma|jane street)\b/,
    'finance',
  ],
  [/\b(pfizer|moderna|genentech|roche|novartis|johnson & johnson|unitedhealth|kaiser|iqvia)\b/, 'healthcare'],
  [/\b(mckinsey|bain|bcg|boston consulting|deloitte|accenture|pwc|ey\b|kpmg)\b/, 'consulting'],
  [/\b(crowdstrike|palo alto networks|okta|cloudflare|zscaler|sentinelone|rapid7)\b/, 'cybersecurity'],
  [/\b(nvidia|tsmc|intel|amd|qualcomm|arm holdings|broadcom|asml)\b/, 'hardware'],
  [
    /\b(google|alphabet|microsoft|meta|facebook|amazon|apple|netflix|salesforce|oracle|ibm|adobe|uber|airbnb|linkedin)\b/,
    'software',
  ],
];

const TITLE_INDUSTRY: Array<[RegExp, string]> = [
  [
    /\b(machine learning|ml engineer|ai engineer|llm|deep learning|generative ai|artificial intelligence|mlops)\b/,
    'ai',
  ],
  [/\b(fintech|payments engineer|quant(itative)? (trader|researcher|developer))\b/, 'fintech'],
  [/\b(physician|surgeon|nurse|pharmacist|clinical|healthcare|medical doctor)\b/, 'healthcare'],
  [/\b(cybersecurity|security engineer|infosec|appsec|pentester)\b/, 'cybersecurity'],
];

const TITLE_FAMILY: Array<[RegExp, string]> = [
  [/\b(founder|co-founder|cofounder)\b/, 'founder'],
  [
    /\b(data scientist|data engineer|data analyst|machine learning|ml engineer|applied scientist|statistician)\b/,
    'data',
  ],
  [/\b(product manager|product owner|\bpm\b|group product)\b/, 'product'],
  [/\b(designer|ux|ui\/ux|user experience|product design)\b/, 'design'],
  [/\b(account executive|sales|business development|\bbdr\b|\badr\b|account manager)\b/, 'sales'],
  [/\b(marketing|growth marketing|brand|content strategist|seo)\b/, 'marketing'],
  [/\b(recruiter|talent|people partner|human resources|\bhrbp\b)\b/, 'hr'],
  [/\b(counsel|attorney|lawyer|legal)\b/, 'legal'],
  [/\b(accountant|controller|cfo|financial analyst|investment banker)\b/, 'finance'],
  [/\b(researcher|research scientist|scientist)\b/, 'research'],
  [/\b(customer success|support|solutions architect)\b/, 'customer'],
  [/\b(operations|coo|chief of staff|program manager|project manager)\b/, 'operations'],
  [
    /\b(engineer|developer|sre|devops|software|swe|full[- ]?stack|backend|frontend|architect|programmer)\b/,
    'engineering',
  ],
  [/\b(ceo|cto|cfo|coo|chief |president)\b/, 'leadership'],
];

const TITLE_SENIORITY: Array<[RegExp, string]> = [
  [/\b(intern|internship)\b/, 'intern'],
  [/\b(founder|co-founder|cofounder|owner)\b/, 'founder'],
  [/\b(chief |^c[teofm]o\b|\bceo\b|\bcto\b|\bcfo\b|\bcoo\b|\bcmo\b)/, 'c_level'],
  [/\b(svp|evp|vice president|\bvp\b)\b/, 'vp'],
  [/\b(director|head of)\b/, 'director'],
  [/\b(engineering manager|manager|head)\b/, 'manager'],
  [/\b(principal|staff|distinguished|fellow)\b/, 'staff'],
  [/\b(senior|sr\.?)\b/, 'senior'],
  [/\b(junior|jr\.?|associate|entry[- ]level)\b/, 'junior'],
];

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'United States',
  us: 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  'united states': 'United States',
  'united states of america': 'United States',
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  'united kingdom': 'United Kingdom',
  'great britain': 'United Kingdom',
  england: 'United Kingdom',
  india: 'India',
  canada: 'Canada',
  germany: 'Germany',
  france: 'France',
  australia: 'Australia',
  singapore: 'Singapore',
  netherlands: 'Netherlands',
  ireland: 'Ireland',
  brazil: 'Brazil',
  japan: 'Japan',
  china: 'China',
  spain: 'Spain',
  italy: 'Italy',
  sweden: 'Sweden',
  switzerland: 'Switzerland',
  'united arab emirates': 'United Arab Emirates',
  uae: 'United Arab Emirates',
};

export function classifyIndustry(input: {
  observedIndustry?: string | null;
  title?: string | null;
  company?: string | null;
}): Classification | null {
  const observed = (input.observedIndustry ?? '').trim();
  if (observed) {
    const mapped = mapObservedIndustry(observed);
    return {
      key: mapped ?? slug(observed),
      label: mapped ? INDUSTRIES[mapped] : observed,
      confidence: 'high',
      trust: 'observed',
      evidence: `LinkedIn industry field: “${observed}”`,
    };
  }

  const title = (input.title ?? '').toLowerCase();
  const company = (input.company ?? '').toLowerCase();

  for (const [re, key] of TITLE_INDUSTRY) {
    if (re.test(title)) {
      return {
        key,
        label: INDUSTRIES[key],
        confidence: 'medium',
        trust: 'inferred',
        evidence: `Inferred from job title matching ${re}`,
      };
    }
  }
  for (const [re, key] of COMPANY_INDUSTRY) {
    if (re.test(company)) {
      return {
        key,
        label: INDUSTRIES[key],
        confidence: 'medium',
        trust: 'inferred',
        evidence: `Inferred from company name matching ${re}`,
      };
    }
  }
  return null;
}

function mapObservedIndustry(raw: string): string | null {
  const v = raw.toLowerCase();
  if (/\b(artificial intelligence|machine learning|computer software)\b/.test(v) || v.includes('internet')) {
    if (/\bai\b|machine learning|artificial intelligence/.test(v)) return 'ai';
    return 'software';
  }
  if (/\b(financial|banking|investment|venture|capital market)/.test(v)) return 'finance';
  if (/\b(hospital|health|pharma|medical|wellness)/.test(v)) return 'healthcare';
  if (/\bconsult/.test(v)) return 'consulting';
  if (/\beducation|higher ed|e-learning/.test(v)) return 'education';
  if (/\blaw|legal/.test(v)) return 'legal';
  if (/\breal estate/.test(v)) return 'real_estate';
  if (/\btelecom|wireless/.test(v)) return 'telecom';
  if (/\bretail|consumer goods/.test(v)) return 'retail';
  if (/\boil|energy|renewable/.test(v)) return 'energy';
  if (/\bmanufactur|industrial/.test(v)) return 'manufacturing';
  if (/\bnonprofit|non-profit|ngo/.test(v)) return 'nonprofit';
  if (/\bsemiconductor|hardware|computer hardware/.test(v)) return 'hardware';
  if (/\bsecurity|cyber/.test(v)) return 'cybersecurity';
  if (/\bstaffing|recruit|human resources/.test(v)) return 'recruiting';
  if (/\bmedia|publishing|entertainment/.test(v)) return 'media';
  if (/\bgovernment|public policy/.test(v)) return 'government';
  return null;
}

export function classifyRoleFamily(title?: string | null): Classification | null {
  const t = (title ?? '').trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  for (const [re, key] of TITLE_FAMILY) {
    if (re.test(lower)) {
      return {
        key,
        label: ROLE_FAMILIES[key],
        confidence: 'medium',
        trust: 'inferred',
        evidence: `Job title “${t}” matched ${re}`,
      };
    }
  }
  return null;
}

export function classifySeniority(title?: string | null): Classification | null {
  const t = (title ?? '').trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  for (const [re, key] of TITLE_SENIORITY) {
    if (re.test(lower)) {
      return {
        key,
        label: SENIORITY[key],
        confidence: key === 'intern' || key === 'c_level' || key === 'founder' ? 'high' : 'medium',
        trust: 'inferred',
        evidence: `Job title “${t}” matched ${re}`,
      };
    }
  }
  return null;
}

export interface GeoParts {
  city: string | null;
  region: string | null;
  country: string | null;
  confidence: Confidence;
  raw: string;
}

export function parseLocation(location?: string | null): GeoParts | null {
  const raw = (location ?? '').trim();
  if (!raw) return null;
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const last = parts[parts.length - 1];
  const country = COUNTRY_ALIASES[last.toLowerCase()] ?? (looksLikeCountry(last) ? titleCase(last) : null);

  if (parts.length >= 3) {
    return {
      city: parts[0],
      region: parts[1],
      country: country ?? parts[2],
      confidence: country ? 'high' : 'medium',
      raw,
    };
  }
  if (parts.length === 2) {
    if (country) {
      return { city: parts[0], region: null, country, confidence: 'high', raw };
    }
    return { city: parts[0], region: parts[1], country: null, confidence: 'low', raw };
  }
  if (country) {
    return { city: null, region: null, country, confidence: 'high', raw };
  }
  return { city: parts[0], region: null, country: null, confidence: 'low', raw };
}

function looksLikeCountry(value: string): boolean {
  return value.length > 3 && !/\d/.test(value) && Boolean(COUNTRY_ALIASES[value.toLowerCase()]);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}
