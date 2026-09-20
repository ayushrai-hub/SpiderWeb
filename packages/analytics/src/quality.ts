import { coverage } from './stats.js';
import type { Coverage, EducationFact, EmploymentFact, PersonFact } from './types.js';

export interface FieldCoverage {
  field: string;
  coverage: Coverage;
}

export interface DataQuality {
  fields: FieldCoverage[];
  duplicateUrlRate: number;
  peopleWithEmploymentHistory: number;
  peopleWithEducation: number;
  method: string;
}

export function calculateDataQuality(
  people: PersonFact[],
  employment: EmploymentFact[],
  education: EducationFact[]
): DataQuality {
  const total = people.length;
  const field = (name: string, known: number): FieldCoverage => ({
    field: name,
    coverage: coverage(known, total),
  });

  const urls = people.map((p) => p.profileUrl).filter(Boolean) as string[];
  const uniqueUrls = new Set(urls.map((u) => u.toLowerCase()));
  const duplicateUrlRate = urls.length > 0 ? (urls.length - uniqueUrls.size) / urls.length : 0;

  const withEmployment = new Set(employment.map((e) => e.personId));
  const withEducation = new Set(education.filter((e) => e.schoolName).map((e) => e.personId));

  return {
    fields: [
      field('profileUrl', people.filter((p) => p.profileUrl).length),
      field('company', people.filter((p) => p.currentCompany).length),
      field('title', people.filter((p) => p.currentTitle).length),
      field('location', people.filter((p) => p.location).length),
      field('connectionDate', people.filter((p) => p.connectedAt).length),
      field('email', people.filter((p) => p.email).length),
      field('observedIndustry', people.filter((p) => p.observedIndustry).length),
    ],
    duplicateUrlRate,
    peopleWithEmploymentHistory: [...withEmployment].filter(
      (id) => employment.filter((e) => e.personId === id).length > 1
    ).length,
    peopleWithEducation: [...withEducation].filter((id) => people.some((p) => p.id === id)).length,
    method:
      'Field presence over connection records. Missing is not treated as zero in other metrics; it is coverage.',
  };
}
