export function generateId(): string {
  return crypto.randomUUID();
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseLinkedInDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;

  const trimmed = dateStr.trim();

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(trimmed);
  }

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const parts = trimmed.split(' ');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const monthIdx = monthNames.indexOf(parts[1]);
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && monthIdx >= 0 && !isNaN(year)) {
      return new Date(year, monthIdx, day);
    }
  }

  if (parts.length === 2) {
    const monthIdx = monthNames.indexOf(parts[0]);
    const year = parseInt(parts[1], 10);
    if (monthIdx >= 0 && !isNaN(year)) {
      return new Date(year, monthIdx, 1);
    }
  }

  if (/^\d{4}$/.test(trimmed)) {
    return new Date(parseInt(trimmed, 10), 0, 1);
  }

  return null;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ');
}
