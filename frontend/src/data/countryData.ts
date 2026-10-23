// Static country lookup tables shared across the app.
// Adding a new country: update all three maps (FLAGS, CODES, ORDER if priority-sorted).

const COUNTRY_FLAGS: Record<string, string> = {
  'Australia': 'au', 'Austria': 'at', 'Bahrain': 'bh', 'Belgium': 'be',
  'Brazil': 'br', 'Canada': 'ca', 'Chile': 'cl', 'China': 'cn',
  'Colombia': 'co', 'Czech Republic': 'cz', 'Denmark': 'dk', 'Egypt': 'eg',
  'Finland': 'fi', 'France': 'fr', 'Germany': 'de', 'Greece': 'gr',
  'Hong Kong': 'hk', 'Hungary': 'hu', 'India': 'in', 'Indonesia': 'id',
  'Ireland': 'ie', 'Israel': 'il', 'Italy': 'it', 'Japan': 'jp',
  'Jordan': 'jo', 'Kenya': 'ke', 'Kuwait': 'kw', 'Luxembourg': 'lu',
  'Malaysia': 'my', 'Mexico': 'mx', 'Morocco': 'ma', 'Netherlands': 'nl',
  'New Zealand': 'nz', 'Nigeria': 'ng', 'Norway': 'no', 'Oman': 'om',
  'Panama': 'pa', 'Peru': 'pe', 'Philippines': 'ph', 'Poland': 'pl',
  'Portugal': 'pt', 'Qatar': 'qa', 'Romania': 'ro', 'Saudi Arabia': 'sa',
  'Singapore': 'sg', 'Slovakia': 'sk', 'South Africa': 'za', 'South Korea': 'kr',
  'Spain': 'es', 'Sweden': 'se', 'Switzerland': 'ch', 'Taiwan': 'tw',
  'Thailand': 'th', 'Turkey': 'tr', 'United Arab Emirates': 'ae',
  'United Kingdom': 'gb', 'United States': 'us', 'Vietnam': 'vn',
  'UK': 'gb', 'USA': 'us', 'UAE': 'ae', 'Korea': 'kr', 'Serbia': 'rs',
};

const COUNTRY_CODES: Record<string, string> = {
  'Australia': 'AUS', 'Austria': 'AUT', 'Bahrain': 'BHR', 'Belgium': 'BEL',
  'Brazil': 'BRA', 'Canada': 'CAN', 'Chile': 'CHL', 'China': 'CHN',
  'Colombia': 'COL', 'Czech Republic': 'CZE', 'Denmark': 'DNK', 'Egypt': 'EGY',
  'Finland': 'FIN', 'France': 'FRA', 'Germany': 'DEU', 'Greece': 'GRC',
  'Hong Kong': 'HKG', 'Hungary': 'HUN', 'India': 'IND', 'Indonesia': 'IDN',
  'Ireland': 'IRL', 'Israel': 'ISR', 'Italy': 'ITA', 'Japan': 'JPN',
  'Jordan': 'JOR', 'Kenya': 'KEN', 'Kuwait': 'KWT', 'Luxembourg': 'LUX',
  'Malaysia': 'MYS', 'Mexico': 'MEX', 'Morocco': 'MAR', 'Netherlands': 'NLD',
  'New Zealand': 'NZL', 'Nigeria': 'NGA', 'Norway': 'NOR', 'Oman': 'OMN',
  'Panama': 'PAN', 'Peru': 'PER', 'Philippines': 'PHL', 'Poland': 'POL',
  'Portugal': 'PRT', 'Qatar': 'QAT', 'Romania': 'ROU', 'Saudi Arabia': 'SAU',
  'Serbia': 'SRB', 'Singapore': 'SGP', 'Slovakia': 'SVK', 'South Africa': 'ZAF',
  'South Korea': 'KOR', 'Spain': 'ESP', 'Sweden': 'SWE', 'Switzerland': 'CHE',
  'Taiwan': 'TWN', 'Thailand': 'THA', 'Turkey': 'TUR',
  'United Arab Emirates': 'ARE', 'United Kingdom': 'GBR', 'United States': 'USA',
  'Vietnam': 'VNM', 'UK': 'GBR', 'USA': 'USA', 'UAE': 'ARE', 'Korea': 'KOR',
};

/** Countries displayed first (in order), all others sorted alphabetically after. */
export const COUNTRY_ORDER = [
  'Japan', 'Australia', 'Singapore', 'Indonesia', 'Malaysia',
  'China', 'South Korea', 'India', 'Philippines', 'Thailand',
];

export function flagUrl(country: string): string | null {
  const code = COUNTRY_FLAGS[country];
  return code ? `https://flagcdn.com/w20/${code}.png` : null;
}

export function countryCode(name: string): string {
  return COUNTRY_CODES[name] ?? name.slice(0, 3).toUpperCase();
}
