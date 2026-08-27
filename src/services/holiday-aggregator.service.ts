import { MemoryCache } from '../cache/memory-cache';
import type {
  CanonicalHoliday,
  HolidayCategory,
  HolidayConfidence,
  HolidaySourceAlias,
  ObservedDateEvidence,
  RawHolidayRecord,
} from '../domain/holiday';
import type { HolidayConflict } from '../domain/holiday-conflict';
import type { HolidayProvider } from '../providers/holiday-provider';
import { HolidayNormalizer } from './holiday-normalizer';

/**
 * Error thrown when all holiday providers fail to resolve.
 */
export class HolidayAggregationError extends Error {
  readonly year: number;
  readonly providerErrors: Array<{ providerId: string; error: unknown }>;

  constructor(
    year: number,
    message: string,
    providerErrors: Array<{ providerId: string; error: unknown }> = []
  ) {
    super(message);
    this.name = 'HolidayAggregationError';
    this.year = year;
    this.providerErrors = providerErrors;
  }
}

export interface AggregatorOptions {
  bypassCache?: boolean;
  ttlMs?: number;
}

/**
 * Service responsible for orchestrating multi-source fetching, normalisation,
 * deduplication, provenance tracking, conflict detection, and caching.
 */
export class HolidayAggregatorService {
  private readonly cache: MemoryCache<CanonicalHoliday[]>;

  constructor(
    private readonly providers: HolidayProvider[],
    cacheInstance?: MemoryCache<CanonicalHoliday[]>
  ) {
    this.cache = cacheInstance ?? new MemoryCache<CanonicalHoliday[]>();
  }

  /**
   * Retrieves aggregated canonical holidays for a given year.
   */
  async getHolidays(
    year: number,
    options?: AggregatorOptions
  ): Promise<CanonicalHoliday[]> {
    const cacheKey = `holiday:canonical:${year}`;

    if (!options?.bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.length > 0) {
        return cached;
      }
    }

    if (this.providers.length === 0) {
      throw new HolidayAggregationError(
        year,
        `No holiday providers registered to aggregate data for year ${year}`
      );
    }

    // Call all providers independently via Promise.allSettled
    const results = await Promise.allSettled(
      this.providers.map((p) => p.fetchHolidays(year))
    );

    const rawRecords: RawHolidayRecord[] = [];
    const providerErrors: Array<{ providerId: string; error: unknown }> = [];

    results.forEach((res, index) => {
      const provider = this.providers[index];
      if (res.status === 'fulfilled') {
        rawRecords.push(...res.value);
      } else {
        providerErrors.push({
          providerId: provider.id,
          error: res.reason,
        });
      }
    });

    // If ALL providers failed, throw a typed aggregation error
    if (rawRecords.length === 0 && providerErrors.length === this.providers.length) {
      throw new HolidayAggregationError(
        year,
        `Failed to aggregate holidays for year ${year}: all ${this.providers.length} provider(s) failed`,
        providerErrors
      );
    }

    if (rawRecords.length === 0) {
      return [];
    }

    // Group and aggregate records into canonical representation
    const canonicalList = this.aggregateRecords(rawRecords);

    // Cache successful non-empty aggregation
    if (canonicalList.length > 0) {
      this.cache.set(cacheKey, canonicalList, options?.ttlMs);
    }

    return canonicalList;
  }

  /**
   * Groups raw records into canonical events while tracking provenance and conflicts.
   */
  private aggregateRecords(rawRecords: RawHolidayRecord[]): CanonicalHoliday[] {
    const groups = new Map<string, RawHolidayRecord[]>();

    for (const record of rawRecords) {
      const semanticKey = HolidayNormalizer.getSemanticKey(
        record.name,
        record.date
      );

      const existing = groups.get(semanticKey);
      if (existing) {
        existing.push(record);
      } else {
        groups.set(semanticKey, [record]);
      }
    }

    const canonicalHolidays: CanonicalHoliday[] = [];

    for (const [, records] of groups.entries()) {
      const canonical = this.buildCanonicalHoliday(records);
      canonicalHolidays.push(canonical);
    }

    // Deterministic sorting: date ASC, then name ASC
    return canonicalHolidays.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Builds a single canonical holiday from a group of matched raw records.
   */
  private buildCanonicalHoliday(records: RawHolidayRecord[]): CanonicalHoliday {
    const sources = Array.from(new Set(records.map((r) => r.sourceId)));
    const confidence: HolidayConfidence =
      sources.length > 1 ? 'multi_source' : 'single_source';

    const aliases: HolidaySourceAlias[] = records.map((r) => ({
      sourceId: r.sourceId,
      name: r.name,
      date: r.date,
      category: r.category,
      rawCategory: r.rawCategory,
      slug: r.slug,
    }));

    const observedDates: ObservedDateEvidence[] = records.map((r) => ({
      sourceId: r.sourceId,
      date: r.date,
      name: r.name,
    }));

    const conflicts: HolidayConflict[] = [];

    // 1. Detect Date Conflict
    const uniqueDates = Array.from(new Set(records.map((r) => r.date)));
    if (uniqueDates.length > 1) {
      conflicts.push({
        type: 'date_conflict',
        sources,
        details: observedDates.map(
          (o) => `${o.sourceId}: ${o.date} (${o.name})`
        ),
        observedDates: observedDates.map((o) => ({
          sourceId: o.sourceId,
          date: o.date,
        })),
      });
    }

    // 2. Detect Name Variation
    const uniqueNames = Array.from(new Set(records.map((r) => r.name)));
    if (uniqueNames.length > 1) {
      conflicts.push({
        type: 'name_variation',
        sources,
        details: records.map((r) => `${r.sourceId}: "${r.name}"`),
      });
    }

    // 3. Detect Category Conflict
    const uniqueCategories = Array.from(new Set(records.map((r) => r.category)));
    if (uniqueCategories.length > 1) {
      conflicts.push({
        type: 'category_conflict',
        sources,
        details: records.map((r) => `${r.sourceId}: ${r.category}`),
      });
    }

    // 4. Detect National Status Conflict
    const uniqueStatus = Array.from(
      new Set(records.map((r) => r.isNationalHoliday))
    );
    if (uniqueStatus.length > 1) {
      conflicts.push({
        type: 'national_status_conflict',
        sources,
        details: records.map(
          (r) => `${r.sourceId}: isNationalHoliday=${r.isNationalHoliday}`
        ),
      });
    }

    // Select primary canonical values deterministically
    const primaryRecord = records[0];
    const canonicalDate = primaryRecord.date;

    // Pick most complete / representative display name
    const canonicalName = this.selectCanonicalName(records);

    // Resolve category
    const canonicalCategory = this.resolveCanonicalCategory(records);
    const isNationalHoliday =
      canonicalCategory !== 'cuti_bersama' &&
      canonicalCategory !== 'observance';

    return {
      date: canonicalDate,
      name: canonicalName,
      category: canonicalCategory,
      isNationalHoliday,
      sources,
      confidence,
      aliases,
      observedDates,
      conflicts,
    };
  }

  private selectCanonicalName(records: RawHolidayRecord[]): string {
    if (records.length === 1) return records[0].name;

    // Prefer Tanggalans name if present as baseline, or longest formal title
    const tanggalansRecord = records.find((r) => r.sourceId === 'tanggalans');
    if (tanggalansRecord) return tanggalansRecord.name;

    return records.reduce((longest, current) =>
      current.name.length > longest.name.length ? current : longest
    ).name;
  }

  private resolveCanonicalCategory(
    records: RawHolidayRecord[]
  ): HolidayCategory {
    if (records.some((r) => r.category === 'cuti_bersama')) {
      return 'cuti_bersama';
    }
    if (records.some((r) => r.category === 'religious')) {
      return 'religious';
    }
    if (records.some((r) => r.category === 'national')) {
      return 'national';
    }
    if (records.some((r) => r.category === 'observance')) {
      return 'observance';
    }
    return 'unknown';
  }
}
