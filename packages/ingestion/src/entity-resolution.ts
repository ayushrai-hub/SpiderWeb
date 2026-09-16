import type {
  NormalizedPerson,
  NormalizedCompany,
} from './normalizer.js';

export interface EntityMatch {
  entityId: string;
  entityType: 'person' | 'company';
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'partial';
  matchedBy: string[];
}

export interface ResolutionResult {
  matched: EntityMatch[];
  possible: EntityMatch[];
  unresolved: EntityMatch[];
  duplicates: string[];
  stats: {
    totalPersons: number;
    matchedPersons: number;
    possiblePersons: number;
    unresolvedPersons: number;
    totalCompanies: number;
    matchedCompanies: number;
    possibleCompanies: number;
    unresolvedCompanies: number;
  };
}

function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

function calculateSimilarity(a: string, b: string): number {
  const normalizedA = normalizeForComparison(a);
  const normalizedB = normalizeForComparison(b);
  
  if (normalizedA === normalizedB) return 1.0;
  
  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= normalizedA.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= normalizedB.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= normalizedA.length; i++) {
    for (let j = 1; j <= normalizedB.length; j++) {
      const cost = normalizedA[i - 1] === normalizedB[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const maxLen = Math.max(normalizedA.length, normalizedB.length);
  return 1 - matrix[normalizedA.length][normalizedB.length] / maxLen;
}

function matchPersons(
  persons: NormalizedPerson[],
  existingPersons: NormalizedPerson[]
): ResolutionResult {
  const matched: EntityMatch[] = [];
  const possible: EntityMatch[] = [];
  const unresolved: EntityMatch[] = [];
  const duplicates: string[] = [];

  for (const person of persons) {
    let bestMatch: EntityMatch | null = null;
    
    for (const existing of existingPersons) {
      const signals: string[] = [];
      let confidence = 0;
      
      // Profile URL match (highest confidence)
      if (person.profileUrl && existing.profileUrl) {
        if (normalizeForComparison(person.profileUrl) === normalizeForComparison(existing.profileUrl)) {
          signals.push('profileUrl');
          confidence = Math.max(confidence, 0.98);
        }
      }
      
      // LinkedIn ID match
      if (person.linkedinId && existing.linkedinId) {
        if (person.linkedinId === existing.linkedinId) {
          signals.push('linkedinId');
          confidence = Math.max(confidence, 0.99);
        }
      }
      
      // Email match
      if (person.email && existing.email) {
        if (normalizeForComparison(person.email) === normalizeForComparison(existing.email)) {
          signals.push('email');
          confidence = Math.max(confidence, 0.95);
        }
      }
      
      // Name + Company + Title match
      const nameSimilarity = calculateSimilarity(person.fullName, existing.fullName);
      const companySimilarity = person.company && existing.company
        ? calculateSimilarity(person.company, existing.company)
        : 0;
      const titleSimilarity = person.title && existing.title
        ? calculateSimilarity(person.title, existing.title)
        : 0;
      
      if (nameSimilarity > 0.9) {
        signals.push('name');
        confidence = Math.max(confidence, nameSimilarity * 0.7);
        
        if (companySimilarity > 0.8) {
          signals.push('company');
          confidence = Math.max(confidence, nameSimilarity * 0.8 + companySimilarity * 0.15);
        }
        
        if (titleSimilarity > 0.8) {
          signals.push('title');
          confidence = Math.max(confidence, nameSimilarity * 0.75 + titleSimilarity * 0.2);
        }
        
        if (companySimilarity > 0.8 && titleSimilarity > 0.8) {
          signals.push('company+title');
          confidence = Math.max(confidence, 0.85);
        }
      }
      
      if (confidence >= 0.9 && signals.length >= 2) {
        bestMatch = {
          entityId: existing.linkedinId || existing.email || existing.fullName,
          entityType: 'person',
          confidence,
          matchType: confidence >= 0.95 ? 'exact' : 'fuzzy',
          matchedBy: signals,
        };
        break;
      } else if (confidence >= 0.7 && signals.length >= 1) {
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = {
            entityId: existing.linkedinId || existing.email || existing.fullName,
            entityType: 'person',
            confidence,
            matchType: 'partial',
            matchedBy: signals,
          };
        }
      }
    }
    
    if (bestMatch) {
      if (bestMatch.confidence >= 0.9) {
        matched.push(bestMatch);
      } else {
        possible.push(bestMatch);
      }
    } else {
      unresolved.push({
        entityId: person.linkedinId || person.email || person.fullName,
        entityType: 'person',
        confidence: 0,
        matchType: 'partial',
        matchedBy: [],
      });
    }
  }

  return {
    matched,
    possible,
    unresolved,
    duplicates,
    stats: {
      totalPersons: persons.length,
      matchedPersons: matched.length,
      possiblePersons: possible.length,
      unresolvedPersons: unresolved.length,
      totalCompanies: 0,
      matchedCompanies: 0,
      possibleCompanies: 0,
      unresolvedCompanies: 0,
    },
  };
}

function matchCompanies(
  companies: NormalizedCompany[],
  existingCompanies: NormalizedCompany[]
): ResolutionResult {
  const matched: EntityMatch[] = [];
  const possible: EntityMatch[] = [];
  const unresolved: EntityMatch[] = [];
  const duplicates: string[] = [];

  for (const company of companies) {
    let bestMatch: EntityMatch | null = null;
    
    for (const existing of existingCompanies) {
      const signals: string[] = [];
      let confidence = 0;
      
      // Exact name match
      const nameSimilarity = calculateSimilarity(company.canonicalName, existing.canonicalName);
      if (nameSimilarity > 0.95) {
        signals.push('name');
        confidence = Math.max(confidence, 0.9);
      }
      
      // Domain match
      if (company.domain && existing.domain) {
        if (normalizeForComparison(company.domain) === normalizeForComparison(existing.domain)) {
          signals.push('domain');
          confidence = Math.max(confidence, 0.95);
        }
      }
      
      // LinkedIn URL match
      if (company.linkedinUrl && existing.linkedinUrl) {
        if (normalizeForComparison(company.linkedinUrl) === normalizeForComparison(existing.linkedinUrl)) {
          signals.push('linkedinUrl');
          confidence = Math.max(confidence, 0.98);
        }
      }
      
      // Industry + size match
      const industrySimilarity = company.industry && existing.industry
        ? calculateSimilarity(company.industry, existing.industry)
        : 0;
      const sizeSimilarity = company.size && existing.size
        ? calculateSimilarity(company.size, existing.size)
        : 0;
      
      if (industrySimilarity > 0.8 && sizeSimilarity > 0.8) {
        signals.push('industry+size');
        confidence = Math.max(confidence, 0.75);
      }
      
      if (confidence >= 0.85) {
        bestMatch = {
          entityId: existing.linkedinUrl || existing.canonicalName,
          entityType: 'company',
          confidence,
          matchType: confidence >= 0.95 ? 'exact' : 'fuzzy',
          matchedBy: signals,
        };
        break;
      } else if (confidence >= 0.65) {
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = {
            entityId: existing.linkedinUrl || existing.canonicalName,
            entityType: 'company',
            confidence,
            matchType: 'partial',
            matchedBy: signals,
          };
        }
      }
    }
    
    if (bestMatch) {
      if (bestMatch.confidence >= 0.85) {
        matched.push(bestMatch);
      } else {
        possible.push(bestMatch);
      }
    } else {
      unresolved.push({
        entityId: company.linkedinUrl || company.canonicalName,
        entityType: 'company',
        confidence: 0,
        matchType: 'partial',
        matchedBy: [],
      });
    }
  }

  return {
    matched,
    possible,
    unresolved,
    duplicates,
    stats: {
      totalPersons: 0,
      matchedPersons: 0,
      possiblePersons: 0,
      unresolvedPersons: 0,
      totalCompanies: companies.length,
      matchedCompanies: matched.length,
      possibleCompanies: possible.length,
      unresolvedCompanies: unresolved.length,
    },
  };
}

export function resolveEntities(
  newPersons: NormalizedPerson[],
  newCompanies: NormalizedCompany[],
  existingPersons: NormalizedPerson[] = [],
  existingCompanies: NormalizedCompany[] = []
): ResolutionResult {
  const personResult = matchPersons(newPersons, existingPersons);
  const companyResult = matchCompanies(newCompanies, existingCompanies);

  return {
    matched: [...personResult.matched, ...companyResult.matched],
    possible: [...personResult.possible, ...companyResult.possible],
    unresolved: [...personResult.unresolved, ...companyResult.unresolved],
    duplicates: [...personResult.duplicates, ...companyResult.duplicates],
    stats: {
      totalPersons: personResult.stats.totalPersons + companyResult.stats.totalPersons,
      matchedPersons: personResult.stats.matchedPersons + companyResult.stats.matchedPersons,
      possiblePersons: personResult.stats.possiblePersons + companyResult.stats.possiblePersons,
      unresolvedPersons: personResult.stats.unresolvedPersons + companyResult.stats.unresolvedPersons,
      totalCompanies: personResult.stats.totalCompanies + companyResult.stats.totalCompanies,
      matchedCompanies: personResult.stats.matchedCompanies + companyResult.stats.matchedCompanies,
      possibleCompanies: personResult.stats.possibleCompanies + companyResult.stats.possibleCompanies,
      unresolvedCompanies: personResult.stats.unresolvedCompanies + companyResult.stats.unresolvedCompanies,
    },
  };
}
