/**
 * Shared Timeline time normalization used by the Content Graph builder and the
 * application data layer. Unknown labels are preserved rather than guessed.
 */
export function normalizeTime(value) {
  if (value == null || value === '') return null;

  if (typeof value === 'object' && !Array.isArray(value)) {
    const result = { ...value };
    if (Number.isFinite(result.year)) {
      result.startYear = result.startYear ?? result.year;
      result.endYear = result.endYear ?? result.year;
      result.precision = result.precision ?? 'year';
    }
    if (
      typeof result.label === 'string' &&
      !Number.isFinite(result.startYear) &&
      !Number.isFinite(result.year)
    ) {
      const parsedLabel = normalizeTime(result.label);
      if (parsedLabel && typeof parsedLabel === 'object') {
        const missingParsedFields = Object.fromEntries(
          Object.entries(parsedLabel).filter(([key]) => key !== 'label' && result[key] == null)
        );
        return {
          ...parsedLabel,
          ...result,
          ...missingParsedFields,
          ...(result.precision === 'unknown' && parsedLabel.precision !== 'unknown'
            ? { precision: parsedLabel.precision }
            : {}),
        };
      }
    }
    return result;
  }

  if (typeof value !== 'string') {
    return { label: String(value), precision: 'unknown' };
  }

  const label = value.trim();

  // Geological / deep-time labels expressed relative to the present.
  const millionYearsAgo = label.match(/^(\d+(?:\.\d+)?)\s+million years ago$/i);
  if (millionYearsAgo) {
    const yearsAgo = Number(millionYearsAgo[1]) * 1_000_000;
    return { label, startYear: -yearsAgo, endYear: -yearsAgo, precision: 'deep-time' };
  }

  const millionYearRange = label.match(/^(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s+million years ago$/i);
  if (millionYearRange) {
    const first = Number(millionYearRange[1]) * 1_000_000;
    const second = Number(millionYearRange[2]) * 1_000_000;
    return {
      label,
      startYear: -Math.max(first, second),
      endYear: -Math.min(first, second),
      precision: 'deep-time-range',
    };
  }

  const exactYear = label.match(/^(\d{1,6})\s*(BC|BCE|AD|CE)$/i);
  if (exactYear) {
    const number = Number(exactYear[1]);
    const era = exactYear[2].toUpperCase();
    const year = ['BC', 'BCE'].includes(era) ? 1 - number : number;
    return { label, year, startYear: year, endYear: year, precision: 'year' };
  }

  // ISO-like dates and plain calendar years.
  const isoDate = label.match(/^(\d{4})(?:-\d{2}(?:-\d{2})?)$/);
  if (isoDate) {
    const year = Number(isoDate[1]);
    return { label, year, startYear: year, endYear: year, precision: label.length === 4 ? 'year' : 'date' };
  }

  const plainYear = label.match(/^(\d{1,4})$/);
  if (plainYear) {
    const year = Number(plainYear[1]);
    return { label, year, startYear: year, endYear: year, precision: 'year' };
  }

  // Broad decade labels such as Early 2000s or Late 1990s.
  const broadDecade = label.match(/^(early|mid|middle|late)\s+(\d{4})s$/i);
  if (broadDecade) {
    const decadeStart = Number(broadDecade[2]);
    const position = broadDecade[1].toLowerCase();
    const offset = position === 'early' ? 0 : position === 'late' ? 7 : 4;
    const year = decadeStart + offset;
    return { label, startYear: year, endYear: year, precision: 'approximate-decade' };
  }

  // Decades such as 1810s or 2020s.
  const decade = label.match(/^(\d{3})(\d)s$/i);
  if (decade) {
    const startYear = Number(`${decade[1]}${decade[2]}`);
    return { label, startYear, endYear: startYear + 9, precision: 'decade' };
  }

  // Explicit year range, optionally with an era.
  const yearRange = label.match(/^(\d{1,6})\s*[–—-]\s*(\d{1,6})\s*(BC|BCE|AD|CE)?$/i);
  if (yearRange) {
    const first = Number(yearRange[1]);
    const second = Number(yearRange[2]);
    const era = yearRange[3]?.toUpperCase();
    let startYear = first;
    let endYear = second;
    if (era === 'BC' || era === 'BCE') {
      startYear = 1 - Math.max(first, second);
      endYear = 1 - Math.min(first, second);
    }
    if (startYear <= endYear) return { label, startYear, endYear, precision: 'range' };
  }

  const centuryRange = label.match(/^(\d+)(?:st|nd|rd|th)?\s*[–—-]\s*(\d+)(?:st|nd|rd|th)?\s+centuries?\s+(BC|BCE)$/i);
  if (centuryRange) {
    const first = Number(centuryRange[1]);
    const second = Number(centuryRange[2]);
    if (first >= second && second >= 1) {
      return {
        label,
        startYear: 1 - first * 100,
        endYear: 1 - (second - 1) * 100,
        precision: 'century-range',
      };
    }
  }

  const singleCentury = label.match(/^(\d+)(?:st|nd|rd|th)?\s+century\s+(BC|BCE)$/i);
  if (singleCentury) {
    const century = Number(singleCentury[1]);
    if (century >= 1) {
      return {
        label,
        startYear: -century * 100,
        endYear: -(century - 1) * 100 - 1,
        precision: 'century',
      };
    }
  }

  // Centuries without an era and broad early/mid/late century labels.
  const broadCentury = label.match(/^(early|mid|middle|late)\s+(\d+)(?:st|nd|rd|th)?\s+century$/i);
  if (broadCentury) {
    const century = Number(broadCentury[2]);
    const start = (century - 1) * 100 + 1;
    const position = broadCentury[1].toLowerCase();
    const offset = position === 'early' ? 0 : position === 'late' ? 80 : 45;
    const year = start + offset;
    return { label, startYear: year, endYear: year, precision: 'approximate-century' };
  }

  const plainCentury = label.match(/^(\d+)(?:st|nd|rd|th)?\s+century(?:\s+(?:AD|CE))?$/i);
  if (plainCentury) {
    const century = Number(plainCentury[1]);
    if (century >= 1) {
      return {
        label,
        startYear: (century - 1) * 100 + 1,
        endYear: century * 100,
        precision: 'century',
      };
    }
  }

  const plainCenturyRange = label.match(/^(\d+)(?:st|nd|rd|th)?\s*[–—-]\s*(\d+)(?:st|nd|rd|th)?\s+centuries?$/i);
  if (plainCenturyRange) {
    const first = Number(plainCenturyRange[1]);
    const second = Number(plainCenturyRange[2]);
    if (first <= second && first >= 1) {
      return {
        label,
        startYear: (first - 1) * 100 + 1,
        endYear: second * 100,
        precision: 'century-range',
      };
    }
  }

  // A year at the end of a descriptive date, e.g. 27 October 1962.
  const trailingYear = label.match(/\b(\d{1,4})\s*$/);
  if (trailingYear && /[a-z]/i.test(label)) {
    const year = Number(trailingYear[1]);
    return { label, year, startYear: year, endYear: year, precision: 'date' };
  }

  return { label, precision: 'unknown' };
}

export function timeLabel(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (typeof value.label === 'string') return value.label;
    if (typeof value.year === 'number') return String(value.year);
  }
  return '';
}

export function timelineSortValue(value) {
  const normalized = normalizeTime(value);
  if (normalized && typeof normalized === 'object') {
    if (Number.isFinite(normalized.startYear)) return normalized.startYear;
    if (Number.isFinite(normalized.year)) return normalized.year;
  }
  const label = timeLabel(normalized).trim().toLowerCase();
  if (/present|modern|today|current/.test(label)) return Number.MAX_SAFE_INTEGER - 1;
  return Number.MAX_SAFE_INTEGER;
}
