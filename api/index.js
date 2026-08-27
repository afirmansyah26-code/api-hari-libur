// src/entry-vercel.ts
import { handle } from "@hono/node-server/vercel";

// src/app.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException as HTTPException2 } from "hono/http-exception";
import { logger } from "hono/logger";

// src/middleware/zod.ts
import { HTTPException } from "hono/http-exception";
import { zValidator as zv } from "@hono/zod-validator";
var zValidator = (target, schema) => zv(target, schema, (result) => {
  if (!result.success) {
    throw new HTTPException(422, {
      message: "The given data was invalid.",
      cause: result.error.flatten().fieldErrors
    });
  }
});

// src/providers/holiday-provider.ts
var HOLIDAY_SOURCE_IDS = {
  TANGGALANS: "tanggalans",
  HUSNIADIL: "husniadil"
};
var HolidayProviderError = class extends Error {
  providerId;
  cause;
  constructor(providerId, message, options) {
    super(message);
    this.name = "HolidayProviderError";
    this.providerId = providerId;
    this.cause = options?.cause;
  }
};

// src/providers/tanggalans.provider.ts
import * as cheerio from "cheerio";

// src/constants/month.ts
var MONTH_NAME = {
  "januari": "01",
  "februari": "02",
  "maret": "03",
  "april": "04",
  "mei": "05",
  "juni": "06",
  "juli": "07",
  "agustus": "08",
  "september": "09",
  "oktober": "10",
  "november": "11",
  "desember": "12"
};
var MONTH_SHORT_NAME = {
  "jan": "01",
  "feb": "02",
  "mar": "03",
  "apr": "04",
  "mei": "05",
  "jun": "06",
  "jul": "07",
  "agu": "08",
  "ags": "08",
  "sep": "09",
  "okt": "10",
  "nov": "11",
  "des": "12"
};

// src/providers/utils/date-validator.ts
function validateAndFormatDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) {
    return null;
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// src/providers/utils/fetch-html.ts
var DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var DEFAULT_TIMEOUT_MS = 1e4;
async function fetchHtml(providerId, url, options) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;
  const fetchFn = options?.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none"
      }
    });
    if (!response.ok) {
      throw new HolidayProviderError(
        providerId,
        `Failed to fetch holiday data from ${providerId} for URL ${url}: HTTP ${response.status} ${response.statusText}`
      );
    }
    return await response.text();
  } catch (err) {
    if (err instanceof HolidayProviderError) {
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new HolidayProviderError(
        providerId,
        `Request to ${providerId} timed out after ${timeoutMs}ms for URL ${url}`,
        { cause: err }
      );
    }
    throw new HolidayProviderError(
      providerId,
      `Network or fetch failure for ${providerId} at ${url}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  } finally {
    clearTimeout(timer);
  }
}

// src/providers/tanggalans.provider.ts
var TanggalansProvider = class {
  constructor(options) {
    this.options = options;
  }
  options;
  id = HOLIDAY_SOURCE_IDS.TANGGALANS;
  name = "Tanggalans.com";
  baseUrl = "https://tanggalans.com";
  async fetchHolidays(year) {
    const url = `${this.baseUrl}/kalender-${year}`;
    const html = await fetchHtml(this.id, url, this.options);
    return this.parseHtml(html, year);
  }
  parseHtml(html, year) {
    const $ = cheerio.load(html);
    const monthContainers = $(".entry-content .kalender-indo");
    if (monthContainers.length === 0) {
      const fallbackContainers = $(".kalender-indo");
      if (fallbackContainers.length === 0) {
        throw new HolidayProviderError(
          this.id,
          `Failed to parse holiday data from ${this.id} for year ${year}: expected calendar structure not found`
        );
      }
    }
    const containers = monthContainers.length > 0 ? monthContainers : $(".kalender-indo");
    const records = [];
    containers.each((_, container) => {
      const titleText = $(container).find(".kal-title .kal-title-link").text().trim();
      if (!titleText) return;
      const [monthWord] = titleText.toLowerCase().split(/\s+/);
      const monthCode = MONTH_NAME[monthWord];
      if (!monthCode) return;
      const monthNum = parseInt(monthCode, 10);
      $(container).find(".kal-libur-list li").each((_2, li) => {
        const dayEl = $(li).find(".kal-libur-day");
        if (dayEl.length === 0) return;
        const dayRaw = dayEl.text().trim();
        if (dayRaw === "-" || dayRaw === "") return;
        const liClone = $(li).clone();
        liClone.find(".kal-libur-day").remove();
        const name = liClone.text().replace(/\s+/g, " ").trim();
        if (!name || name.toLowerCase().includes("bulan tanpa libur")) return;
        const isCutiBersama = name.toLowerCase().includes("cuti bersama");
        const category = isCutiBersama ? "cuti_bersama" : "national";
        const isNationalHoliday = !isCutiBersama;
        if (dayRaw.includes("-")) {
          const [startStr, endStr] = dayRaw.split("-");
          const start = parseInt(startStr, 10);
          const end = parseInt(endStr, 10);
          if (!isNaN(start) && !isNaN(end) && start <= end && start >= 1 && end <= 31) {
            for (let d = start; d <= end; d++) {
              const formattedDate = validateAndFormatDate(year, monthNum, d);
              if (formattedDate) {
                records.push({
                  date: formattedDate,
                  name,
                  category,
                  isNationalHoliday,
                  sourceId: this.id
                });
              }
            }
          }
        } else {
          const dayNum = parseInt(dayRaw, 10);
          if (!isNaN(dayNum)) {
            const formattedDate = validateAndFormatDate(
              year,
              monthNum,
              dayNum
            );
            if (formattedDate) {
              records.push({
                date: formattedDate,
                name,
                category,
                isNationalHoliday,
                sourceId: this.id
              });
            }
          }
        }
      });
    });
    return records;
  }
};

// src/providers/husniadil.provider.ts
import * as cheerio2 from "cheerio";
var HusniadilProvider = class {
  constructor(options) {
    this.options = options;
  }
  options;
  id = HOLIDAY_SOURCE_IDS.HUSNIADIL;
  name = "HusniAdil.com";
  baseUrl = "https://husniadil.com";
  async fetchHolidays(year) {
    const url = `${this.baseUrl}/calendar/${year}/`;
    const html = await fetchHtml(this.id, url, this.options);
    return this.parseHtml(html, year);
  }
  parseHtml(html, year) {
    const $ = cheerio2.load(html);
    const records = [];
    const cardAnchors = $(`a[href*="/calendar/${year}/"]`);
    cardAnchors.each((_, el) => {
      const card = $(el);
      const h3 = card.find("h3");
      if (h3.length === 0) return;
      const name = h3.text().replace(/\s+/g, " ").trim();
      if (!name) return;
      const href = card.attr("href") || "";
      const slugMatch = href.match(
        new RegExp(`/calendar/${year}/([^/?#\\s]+)`)
      );
      const slug = slugMatch ? slugMatch[1] : void 0;
      let dayNum = null;
      card.find("div").each((_2, div) => {
        const text = $(div).text().trim();
        if (/^\d{1,2}$/.test(text)) {
          const num = parseInt(text, 10);
          if (num >= 1 && num <= 31) {
            dayNum = num;
            return false;
          }
        }
      });
      let monthCode = null;
      card.find("div").each((_2, div) => {
        const text = $(div).text().trim().toLowerCase();
        if (text in MONTH_SHORT_NAME) {
          monthCode = MONTH_SHORT_NAME[text];
          return false;
        }
      });
      if (dayNum === null || !monthCode) return;
      const monthNum = parseInt(monthCode, 10);
      const formattedDate = validateAndFormatDate(year, monthNum, dayNum);
      if (!formattedDate) return;
      let rawCategory;
      card.find("div").each((_2, div) => {
        const text = $(div).text().trim();
        if (text.includes("\xB7") || text.toUpperCase().includes("HARI LIBUR") || text.toUpperCase().includes("CUTI BERSAMA")) {
          rawCategory = text.replace(/\s+/g, " ").trim();
          return false;
        }
      });
      const { category, isNationalHoliday } = this.resolveCategory(
        name,
        rawCategory
      );
      records.push({
        date: formattedDate,
        name,
        category,
        isNationalHoliday,
        sourceId: this.id,
        slug,
        rawCategory
      });
    });
    if (records.length === 0) {
      throw new HolidayProviderError(
        this.id,
        `Failed to parse holiday data from ${this.id} for year ${year}: expected holiday list not found`
      );
    }
    return records;
  }
  resolveCategory(name, rawCategory) {
    const lowerRaw = (rawCategory || "").toLowerCase();
    const lowerName = name.toLowerCase();
    if (lowerRaw.includes("cuti bersama") || lowerName.includes("cuti bersama")) {
      return { category: "cuti_bersama", isNationalHoliday: false };
    }
    if (lowerRaw.includes("nasional")) {
      return { category: "national", isNationalHoliday: true };
    }
    if (lowerRaw.includes("keagamaan")) {
      return { category: "religious", isNationalHoliday: true };
    }
    if (lowerRaw.includes("observance")) {
      return { category: "observance", isNationalHoliday: false };
    }
    return {
      category: "unknown",
      isNationalHoliday: lowerRaw.includes("hari libur")
    };
  }
};

// src/providers/index.ts
var holidayProviders = [
  new TanggalansProvider(),
  new HusniadilProvider()
];

// src/schema/date_schema.ts
import { z } from "zod";

// src/utils/timezone.ts
function getJakartaDate(date = /* @__PURE__ */ new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const formatted = formatter.format(date);
  const [yearStr, monthStr, dayStr] = formatted.split("-");
  return {
    year: parseInt(yearStr, 10),
    month: parseInt(monthStr, 10),
    day: parseInt(dayStr, 10),
    dateString: formatted
  };
}
function getJakartaTomorrow(date = /* @__PURE__ */ new Date()) {
  const current = getJakartaDate(date);
  const nextDate = new Date(
    Date.UTC(current.year, current.month - 1, current.day + 1, 12, 0, 0)
  );
  return getJakartaDate(nextDate);
}

// src/schema/date_schema.ts
var dateSchema = z.object({
  year: z.coerce.number().min(2011, {
    message: "Minimum year is 2011"
  }).refine(
    (y) => {
      const maxYear = getJakartaDate().year + 1;
      return y <= maxYear;
    },
    () => ({
      message: `Maximum year is ${getJakartaDate().year + 1}`
    })
  ).optional(),
  month: z.coerce.number().min(1, {
    message: "Minimum month is 1"
  }).max(12, {
    message: "Maximum month is 12"
  }).optional(),
  day: z.coerce.number().min(1, {
    message: "Minimum day is 1"
  }).max(31, {
    message: "Maximum day is 31"
  }).optional()
}).superRefine(({ year, month, day }, ctx) => {
  const targetYear = year ?? getJakartaDate().year;
  if (day) {
    if (!month) {
      ctx.addIssue({
        path: ["month"],
        code: "custom",
        message: "Month is required when specifying day"
      });
      return z.NEVER;
    }
    const parsedDate = new Date(targetYear, month - 1, day);
    if (parsedDate.getFullYear() !== targetYear || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) {
      ctx.addIssue({
        path: ["day"],
        code: "custom",
        message: "The provided date is not valid"
      });
    }
  }
});

// src/cache/memory-cache.ts
var MemoryCache = class {
  constructor(defaultTtlMs = 24 * 60 * 60 * 1e3) {
    this.defaultTtlMs = defaultTtlMs;
  }
  defaultTtlMs;
  store = /* @__PURE__ */ new Map();
  /**
   * Retrieves a cached item if present and not expired.
   * Returns a deep clone to prevent mutation of the cached value.
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return structuredClone(entry.value);
  }
  /**
   * Stores an item in cache with specified TTL.
   * Empty arrays and null/undefined values are explicitly rejected from being cached.
   */
  set(key, value, ttlMs = this.defaultTtlMs) {
    if (value === null || value === void 0) return;
    if (Array.isArray(value) && value.length === 0) return;
    this.store.set(key, {
      value: structuredClone(value),
      expiresAt: Date.now() + ttlMs
    });
  }
  /**
   * Checks if an unexpired item exists in cache.
   */
  has(key) {
    return this.get(key) !== null;
  }
  /**
   * Removes an item from cache.
   */
  delete(key) {
    return this.store.delete(key);
  }
  /**
   * Clears all cache entries.
   */
  clear() {
    this.store.clear();
  }
  /**
   * Returns the count of stored entries (including yet-to-be-evicted expired items).
   */
  get size() {
    return this.store.size;
  }
};

// src/services/holiday-normalizer.ts
var HolidayNormalizer = class {
  /**
   * Normalises punctuation, quotes, apostrophes, and whitespace.
   */
  static cleanText(text) {
    return text.toLowerCase().replace(/[’‘ʻʼ`']/g, "").replace(/[\/\\,\-—_()"\.]/g, " ").replace(/\s+/g, " ").trim();
  }
  /**
   * Normalises phrasing and known semantic variants for comparison.
   */
  static normalizeForComparison(name) {
    let s = this.cleanText(name);
    s = s.replace(/\bhari raya\b/g, "");
    s = s.replace(/\bhari suci\b/g, "");
    s = s.replace(/\bisra\s*mi\s*raj\b/g, "isra miraj");
    s = s.replace(/\bhijriyah\b/g, "h");
    s = s.replace(/\bjumat agung\b/g, "jumat agung");
    s = s.replace(/\bkebangkitan yesus kristus\s*(paskah)?\b/g, "paskah");
    s = s.replace(/\bwafat yesus kristus\s*(jumat agung)?\b/g, "wafat yesus kristus jumat agung");
    s = s.replace(/tahun baru 20\d\d masehi/g, "tahun baru masehi");
    s = s.replace(/tahun baru masehi 20\d\d/g, "tahun baru masehi");
    s = s.replace(/\bcuti bersama tahun baru imlek\b/g, "cuti bersama imlek");
    s = s.replace(/\bcuti bersama hari suci nyepi\b/g, "cuti bersama nyepi");
    s = s.replace(/\bcuti bersama hari kemerdekaan\b/g, "cuti bersama kemerdekaan");
    return s.replace(/\s+/g, " ").trim();
  }
  /**
   * Generates a stable semantic key to identify a unique holiday event within a year.
   */
  static getSemanticKey(name, date) {
    const norm = this.normalizeForComparison(name);
    const month = date.slice(5, 7);
    if (norm.includes("isra miraj")) {
      return month === "01" ? "isra-miraj-jan" : "isra-miraj-dec";
    }
    if (norm.includes("tahun baru masehi")) return "tahun-baru-masehi";
    if (norm.includes("cuti bersama imlek")) return "cuti-bersama-imlek";
    if (norm.includes("imlek") || norm.includes("kongzili")) return "tahun-baru-imlek";
    if (norm.includes("cuti bersama nyepi")) return "cuti-bersama-nyepi";
    if (norm.includes("nyepi") || norm.includes("saka")) return "hari-raya-nyepi";
    if (norm.includes("cuti bersama") && (norm.includes("idul fitri") || norm.includes("fitri"))) {
      return `cuti-bersama-idul-fitri-${date}`;
    }
    if (norm.includes("idul fitri") || norm.includes("fitri")) {
      return `idul-fitri-${date}`;
    }
    if (norm.includes("wafat yesus kristus") || norm.includes("jumat agung")) {
      return "wafat-yesus-kristus-jumat-agung";
    }
    if (norm.includes("paskah")) return "kebangkitan-yesus-kristus-paskah";
    if (norm.includes("hari buruh")) return "hari-buruh-internasional";
    if (norm.includes("cuti bersama kenaikan yesus")) return "cuti-bersama-kenaikan-yesus-kristus";
    if (norm.includes("kenaikan yesus kristus")) return "kenaikan-yesus-kristus";
    if (norm.includes("cuti bersama") && norm.includes("idul adha")) {
      return `cuti-bersama-idul-adha-${date}`;
    }
    if (norm.includes("idul adha")) {
      return "idul-adha";
    }
    if (norm.includes("cuti bersama waisak")) return "cuti-bersama-waisak";
    if (norm.includes("waisak")) return "hari-raya-waisak";
    if (norm.includes("lahir pancasila")) return "hari-lahir-pancasila";
    if (norm.includes("tahun baru islam") || norm.includes("muharram")) return "tahun-baru-islam";
    if (norm.includes("cuti bersama kemerdekaan") || norm.includes("cuti bersama hari kemerdekaan")) {
      return "cuti-bersama-kemerdekaan";
    }
    if (norm.includes("kemerdekaan")) return "hari-kemerdekaan-ri";
    if (norm.includes("maulid")) return "maulid-nabi-muhammad";
    if (norm.includes("cuti bersama natal")) return "cuti-bersama-natal";
    if (norm.includes("natal")) return "hari-raya-natal";
    return `${date}-${norm.replace(/\s+/g, "-")}`;
  }
};

// src/services/holiday-aggregator.service.ts
var HolidayAggregationError = class extends Error {
  year;
  providerErrors;
  constructor(year, message, providerErrors = []) {
    super(message);
    this.name = "HolidayAggregationError";
    this.year = year;
    this.providerErrors = providerErrors;
  }
};
var HolidayAggregatorService = class {
  constructor(providers, cacheInstance) {
    this.providers = providers;
    this.cache = cacheInstance ?? new MemoryCache();
  }
  providers;
  cache;
  /**
   * Retrieves aggregated canonical holidays for a given year.
   */
  async getHolidays(year, options) {
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
    const results = await Promise.allSettled(
      this.providers.map((p) => p.fetchHolidays(year))
    );
    const rawRecords = [];
    const providerErrors = [];
    results.forEach((res, index) => {
      const provider = this.providers[index];
      if (res.status === "fulfilled") {
        rawRecords.push(...res.value);
      } else {
        providerErrors.push({
          providerId: provider.id,
          error: res.reason
        });
      }
    });
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
    const canonicalList = this.aggregateRecords(rawRecords);
    if (canonicalList.length > 0) {
      this.cache.set(cacheKey, canonicalList, options?.ttlMs);
    }
    return canonicalList;
  }
  /**
   * Groups raw records into canonical events while tracking provenance and conflicts.
   */
  aggregateRecords(rawRecords) {
    const groups = /* @__PURE__ */ new Map();
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
    const canonicalHolidays = [];
    for (const [, records] of groups.entries()) {
      const canonical = this.buildCanonicalHoliday(records);
      canonicalHolidays.push(canonical);
    }
    return canonicalHolidays.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.name.localeCompare(b.name);
    });
  }
  /**
   * Builds a single canonical holiday from a group of matched raw records.
   */
  buildCanonicalHoliday(records) {
    const sources = Array.from(new Set(records.map((r) => r.sourceId)));
    const confidence = sources.length > 1 ? "multi_source" : "single_source";
    const aliases = records.map((r) => ({
      sourceId: r.sourceId,
      name: r.name,
      date: r.date,
      category: r.category,
      rawCategory: r.rawCategory,
      slug: r.slug
    }));
    const observedDates = records.map((r) => ({
      sourceId: r.sourceId,
      date: r.date,
      name: r.name
    }));
    const conflicts = [];
    const uniqueDates = Array.from(new Set(records.map((r) => r.date)));
    if (uniqueDates.length > 1) {
      conflicts.push({
        type: "date_conflict",
        sources,
        details: observedDates.map(
          (o) => `${o.sourceId}: ${o.date} (${o.name})`
        ),
        observedDates: observedDates.map((o) => ({
          sourceId: o.sourceId,
          date: o.date
        }))
      });
    }
    const uniqueNames = Array.from(new Set(records.map((r) => r.name)));
    if (uniqueNames.length > 1) {
      conflicts.push({
        type: "name_variation",
        sources,
        details: records.map((r) => `${r.sourceId}: "${r.name}"`)
      });
    }
    const uniqueCategories = Array.from(new Set(records.map((r) => r.category)));
    if (uniqueCategories.length > 1) {
      conflicts.push({
        type: "category_conflict",
        sources,
        details: records.map((r) => `${r.sourceId}: ${r.category}`)
      });
    }
    const uniqueStatus = Array.from(
      new Set(records.map((r) => r.isNationalHoliday))
    );
    if (uniqueStatus.length > 1) {
      conflicts.push({
        type: "national_status_conflict",
        sources,
        details: records.map(
          (r) => `${r.sourceId}: isNationalHoliday=${r.isNationalHoliday}`
        )
      });
    }
    const primaryRecord = records[0];
    const canonicalDate = primaryRecord.date;
    const canonicalName = this.selectCanonicalName(records);
    const canonicalCategory = this.resolveCanonicalCategory(records);
    const isNationalHoliday = canonicalCategory !== "cuti_bersama" && canonicalCategory !== "observance";
    return {
      date: canonicalDate,
      name: canonicalName,
      category: canonicalCategory,
      isNationalHoliday,
      sources,
      confidence,
      aliases,
      observedDates,
      conflicts
    };
  }
  selectCanonicalName(records) {
    if (records.length === 1) return records[0].name;
    const tanggalansRecord = records.find((r) => r.sourceId === "tanggalans");
    if (tanggalansRecord) return tanggalansRecord.name;
    return records.reduce(
      (longest, current) => current.name.length > longest.name.length ? current : longest
    ).name;
  }
  resolveCanonicalCategory(records) {
    if (records.some((r) => r.category === "cuti_bersama")) {
      return "cuti_bersama";
    }
    if (records.some((r) => r.category === "religious")) {
      return "religious";
    }
    if (records.some((r) => r.category === "national")) {
      return "national";
    }
    if (records.some((r) => r.category === "observance")) {
      return "observance";
    }
    return "unknown";
  }
};

// src/landing-html.ts
var LANDING_PAGE_HTML = `<!DOCTYPE html>\r
<html lang="id">\r
<head>\r
    <meta charset="UTF-8">\r
    <meta name="viewport" content="width=device-width, initial-scale=1.0">\r
    <title>API Hari Libur Indonesia - Karena Developer Juga Butuh Tahu Kapan Tanggal Merah</title>\r
\r
    <!-- Favicons -->\r
    <link rel="icon" type="image/x-icon" href="favicon.ico">\r
\r
    <link rel="preconnect" href="https://fonts.googleapis.com">\r
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\r
    <link href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">\r
\r
    <style>\r
        * {\r
            margin: 0;\r
            padding: 0;\r
            box-sizing: border-box;\r
        }\r
\r
        :root {\r
            --bg-primary: #0a0d14;\r
            --bg-secondary: #101623;\r
            --bg-card: #151d2e;\r
            --bg-card-hover: #1c273c;\r
            --red-indonesia: #ff4757;\r
            --red-glow: rgba(255, 71, 87, 0.35);\r
            --white-indonesia: #ffffff;\r
            --accent-dark: #1e293b;\r
            --accent-blue: #60a5fa;\r
            --text-primary: #f1f5f9;\r
            --text-secondary: #94a3b8;\r
            --text-muted: #64748b;\r
            --border: #1e293b;\r
            --border-hover: #334155;\r
            --shadow: rgba(0, 0, 0, 0.5);\r
            --code-bg: #090d16;\r
        }\r
\r
        body {\r
            font-family: 'Plus Jakarta Sans', sans-serif;\r
            background: var(--bg-primary);\r
            color: var(--text-primary);\r
            line-height: 1.6;\r
            overflow-x: hidden;\r
        }\r
\r
        /* Animated Ambient Dark Background with Indonesian Flag Accent */\r
        .bg-decoration {\r
            position: fixed;\r
            top: 0;\r
            left: 0;\r
            width: 100%;\r
            height: 100%;\r
            pointer-events: none;\r
            z-index: 0;\r
            overflow: hidden;\r
            background:\r
                radial-gradient(circle at 15% 15%, rgba(255, 71, 87, 0.08) 0%, transparent 45%),\r
                radial-gradient(circle at 85% 75%, rgba(96, 165, 250, 0.06) 0%, transparent 50%),\r
                radial-gradient(circle at 50% 50%, rgba(255, 71, 87, 0.03) 0%, transparent 60%),\r
                #0a0d14;\r
        }\r
\r
        .bg-decoration::before {\r
            content: '\u{1F1EE}\u{1F1E9}';\r
            position: absolute;\r
            font-size: 320px;\r
            top: 50%;\r
            left: 50%;\r
            transform: translate(-50%, -50%);\r
            opacity: 0.025;\r
            animation: float 30s ease-in-out infinite;\r
            filter: drop-shadow(0 0 50px rgba(255, 71, 87, 0.3));\r
        }\r
\r
        .bg-decoration::after {\r
            content: '';\r
            position: absolute;\r
            top: 0;\r
            left: 0;\r
            right: 0;\r
            bottom: 0;\r
            background-image:\r
                repeating-linear-gradient(\r
                    45deg,\r
                    transparent,\r
                    transparent 50px,\r
                    rgba(255, 71, 87, 0.015) 50px,\r
                    rgba(255, 71, 87, 0.015) 100px\r
                );\r
        }\r
\r
        @keyframes float {\r
            0%, 100% { transform: translate(0, 0) rotate(0deg); }\r
            33% { transform: translate(30px, -30px) rotate(120deg); }\r
            66% { transform: translate(-20px, 20px) rotate(240deg); }\r
        }\r
\r
        /* Container */\r
        .container {\r
            position: relative;\r
            z-index: 1;\r
            max-width: 1200px;\r
            margin: 0 auto;\r
            padding: 0 20px;\r
        }\r
\r
        /* Header */\r
        header {\r
            padding: 40px 0 80px;\r
            text-align: center;\r
            animation: slideDown 0.8s ease-out;\r
        }\r
\r
        @keyframes slideDown {\r
            from {\r
                opacity: 0;\r
                transform: translateY(-30px);\r
            }\r
            to {\r
                opacity: 1;\r
                transform: translateY(0);\r
            }\r
        }\r
\r
        .logo {\r
            display: inline-flex;\r
            align-items: center;\r
            gap: 15px;\r
            margin-bottom: 20px;\r
        }\r
\r
        .logo-icon {\r
            width: 60px;\r
            height: 60px;\r
            background: var(--red-indonesia);\r
            border-radius: 16px;\r
            display: flex;\r
            align-items: center;\r
            justify-content: center;\r
            font-size: 32px;\r
            transform: rotate(-5deg);\r
            animation: pulse 2s ease-in-out infinite;\r
            box-shadow: 0 4px 12px rgba(231, 76, 60, 0.3);\r
        }\r
\r
        @keyframes pulse {\r
            0%, 100% { transform: rotate(-5deg) scale(1); }\r
            50% { transform: rotate(-5deg) scale(1.05); }\r
        }\r
\r
        h1 {\r
            font-family: 'Dela Gothic One', cursive;\r
            font-size: 3.5rem;\r
            color: var(--red-indonesia);\r
            margin-bottom: 15px;\r
            letter-spacing: -2px;\r
            line-height: 1.1;\r
            text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.05);\r
        }\r
\r
        .tagline {\r
            font-size: 1.3rem;\r
            color: #cbd5e1;\r
            font-weight: 300;\r
            margin-bottom: 30px;\r
        }\r
\r
        .tagline strong {\r
            color: var(--red-indonesia);\r
            font-weight: 700;\r
        }\r
\r
        .badges {\r
            display: flex;\r
            gap: 15px;\r
            justify-content: center;\r
            flex-wrap: wrap;\r
            margin-top: 25px;\r
        }\r
\r
        .badge {\r
            display: inline-flex;\r
            align-items: center;\r
            gap: 8px;\r
            padding: 8px 16px;\r
            background: var(--bg-card);\r
            border: 1px solid var(--border);\r
            border-radius: 20px;\r
            font-size: 0.9rem;\r
            color: #cbd5e1;\r
            transition: all 0.3s ease;\r
        }\r
\r
        .badge:hover {\r
            transform: translateY(-2px);\r
            border-color: var(--red-indonesia);\r
            box-shadow: 0 4px 12px var(--red-glow);\r
            background: var(--bg-secondary);\r
            color: #f1f5f9;\r
        }\r
\r
        /* Quick Try Section */\r
        .quick-try {\r
            background: var(--bg-card);\r
            border: 1px solid var(--border);\r
            border-radius: 24px;\r
            padding: 40px;\r
            margin: 40px 0;\r
            position: relative;\r
            overflow: hidden;\r
            animation: fadeIn 0.8s ease-out 0.2s both;\r
            box-shadow: 0 8px 32px var(--shadow);\r
        }\r
\r
        @keyframes fadeIn {\r
            from {\r
                opacity: 0;\r
                transform: translateY(20px);\r
            }\r
            to {\r
                opacity: 1;\r
                transform: translateY(0);\r
            }\r
        }\r
\r
        .quick-try::before {\r
            content: '';\r
            position: absolute;\r
            top: 0;\r
            left: 0;\r
            width: 100%;\r
            height: 4px;\r
            background: var(--red-indonesia);\r
        }\r
\r
        .quick-try h2 {\r
            font-family: 'Dela Gothic One', cursive;\r
            font-size: 1.8rem;\r
            margin-bottom: 10px;\r
            color: #f1f5f9;\r
        }\r
\r
        .quick-try p {\r
            color: #cbd5e1;\r
            margin-bottom: 25px;\r
        }\r
\r
        .try-buttons {\r
            display: grid;\r
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));\r
            gap: 12px;\r
            margin-bottom: 25px;\r
        }\r
\r
        .try-btn {\r
            padding: 14px 24px;\r
            background: var(--bg-secondary);\r
            border: 1px solid var(--border);\r
            border-radius: 12px;\r
            color: var(--text-primary);\r
            cursor: pointer;\r
            transition: all 0.3s ease;\r
            font-size: 0.95rem;\r
            font-weight: 500;\r
            text-align: left;\r
            position: relative;\r
            overflow: hidden;\r
        }\r
\r
        .try-btn::before {\r
            content: '';\r
            position: absolute;\r
            top: 0;\r
            left: -100%;\r
            width: 100%;\r
            height: 100%;\r
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);\r
            transition: left 0.5s ease;\r
        }\r
\r
        .try-btn:hover::before {\r
            left: 100%;\r
        }\r
\r
        .try-btn:hover {\r
            background: var(--bg-secondary);\r
            border-color: var(--red-indonesia);\r
            transform: translateY(-2px);\r
            box-shadow: 0 4px 12px rgba(231, 76, 60, 0.2);\r
        }\r
\r
        .try-btn.active {\r
            background: var(--red-indonesia);\r
            color: white;\r
            border-color: var(--red-indonesia);\r
            box-shadow: 0 4px 16px rgba(231, 76, 60, 0.3);\r
        }\r
\r
        .endpoint-display {\r
            background: var(--bg-secondary);\r
            border: 1px solid var(--border);\r
            border-radius: 12px;\r
            padding: 20px;\r
            margin-bottom: 20px;\r
            font-family: 'Courier New', monospace;\r
            font-size: 0.95rem;\r
            color: var(--accent-blue);\r
            display: flex;\r
            align-items: center;\r
            justify-content: space-between;\r
            gap: 15px;\r
            position: relative;\r
            overflow: hidden;\r
        }\r
\r
        .endpoint-display::before {\r
            content: 'GET';\r
            position: absolute;\r
            left: 0;\r
            top: 0;\r
            bottom: 0;\r
            background: var(--accent-dark);\r
            color: white;\r
            padding: 0 12px;\r
            display: flex;\r
            align-items: center;\r
            font-weight: 700;\r
            font-size: 0.8rem;\r
        }\r
\r
        .endpoint-url {\r
            flex: 1;\r
            padding-left: 60px;\r
            word-break: break-all;\r
            color: var(--accent-blue);\r
        }\r
\r
        .copy-btn {\r
            padding: 8px;\r
            background: var(--red-indonesia);\r
            color: white;\r
            border: none;\r
            border-radius: 8px;\r
            cursor: pointer;\r
            font-weight: 600;\r
            transition: all 0.3s ease;\r
            white-space: nowrap;\r
            display: flex;\r
            align-items: center;\r
            justify-content: center;\r
            width: 40px;\r
            height: 40px;\r
        }\r
\r
        .copy-btn:hover {\r
            background: var(--accent-dark);\r
            transform: scale(1.05);\r
        }\r
\r
        .copy-btn svg {\r
            width: 18px;\r
            height: 18px;\r
        }\r
\r
        .response-box {\r
            background: var(--bg-secondary);\r
            border: 1px solid var(--border);\r
            border-radius: 12px;\r
            padding: 20px;\r
            max-height: 400px;\r
            overflow-y: auto;\r
            font-family: 'Courier New', monospace;\r
            font-size: 0.9rem;\r
        }\r
\r
        .response-box pre {\r
            margin: 0;\r
            white-space: pre-wrap;\r
            word-break: break-all;\r
            color: #e2e8f0;\r
        }\r
\r
        .loading {\r
            text-align: center;\r
            color: var(--text-muted);\r
            padding: 40px;\r
        }\r
\r
        .spinner {\r
            display: inline-block;\r
            width: 40px;\r
            height: 40px;\r
            border: 3px solid var(--border);\r
            border-top-color: var(--red-indonesia);\r
            border-radius: 50%;\r
            animation: spin 0.8s linear infinite;\r
            margin-bottom: 15px;\r
        }\r
\r
        @keyframes spin {\r
            to { transform: rotate(360deg); }\r
        }\r
\r
        /* Documentation Section */\r
        .docs-section {\r
            margin: 60px 0;\r
            animation: fadeIn 0.8s ease-out 0.4s both;\r
        }\r
\r
        .section-header {\r
            text-align: center;\r
            margin-bottom: 50px;\r
        }\r
\r
        .section-header h2 {\r
            font-family: 'Dela Gothic One', cursive;\r
            font-size: 2.5rem;\r
            margin-bottom: 15px;\r
            color: var(--red-indonesia);\r
        }\r
\r
        .section-header p {\r
            color: #cbd5e1;\r
            font-size: 1.1rem;\r
        }\r
\r
        .endpoint-grid {\r
            display: grid;\r
            gap: 25px;\r
        }\r
\r
        .endpoint-card {\r
            background: var(--bg-card);\r
            border: 1px solid var(--border);\r
            border-radius: 16px;\r
            padding: 30px;\r
            transition: all 0.3s ease;\r
            position: relative;\r
            overflow: hidden;\r
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);\r
        }\r
\r
        .endpoint-card::before {\r
            content: '';\r
            position: absolute;\r
            top: 0;\r
            left: 0;\r
            width: 4px;\r
            height: 100%;\r
            background: var(--red-indonesia);\r
            transform: scaleY(0);\r
            transition: transform 0.3s ease;\r
        }\r
\r
        .endpoint-card:hover::before {\r
            transform: scaleY(1);\r
        }\r
\r
        .endpoint-card:hover {\r
            transform: translateX(5px);\r
            border-color: var(--red-indonesia);\r
            box-shadow: 0 8px 24px var(--shadow);\r
        }\r
\r
        .endpoint-card h3 {\r
            font-size: 1.3rem;\r
            margin-bottom: 15px;\r
            color: #f1f5f9;\r
            display: flex;\r
            align-items: center;\r
            gap: 10px;\r
        }\r
\r
        .method-badge {\r
            display: inline-block;\r
            padding: 4px 10px;\r
            background: rgba(59, 130, 246, 0.2);\r
            color: #60a5fa;\r
            border: 1px solid rgba(59, 130, 246, 0.4);\r
            border-radius: 6px;\r
            font-size: 0.75rem;\r
            font-weight: 700;\r
            letter-spacing: 0.5px;\r
        }\r
\r
        .endpoint-path {\r
            font-family: 'Courier New', monospace;\r
            background: var(--code-bg);\r
            padding: 12px 16px;\r
            border-radius: 8px;\r
            margin: 15px 0;\r
            color: #60a5fa;\r
            font-size: 0.95rem;\r
            border: 1px solid var(--border);\r
            font-weight: 600;\r
            position: relative;\r
            cursor: pointer;\r
            transition: all 0.3s ease;\r
            display: flex;\r
            align-items: center;\r
            justify-content: space-between;\r
            gap: 10px;\r
        }\r
\r
        .endpoint-path:hover {\r
            border-color: var(--red-indonesia);\r
            background: var(--bg-card-hover);\r
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);\r
        }\r
\r
        .endpoint-path-text {\r
            flex: 1;\r
            color: #60a5fa;\r
        }\r
\r
        .endpoint-copy-icon {\r
            color: var(--red-indonesia);\r
            opacity: 0.8;\r
            transition: opacity 0.3s ease;\r
            width: 18px;\r
            height: 18px;\r
            flex-shrink: 0;\r
        }\r
\r
        .endpoint-path:hover .endpoint-copy-icon {\r
            opacity: 1;\r
        }\r
\r
        .endpoint-desc {\r
            color: #cbd5e1;\r
            margin-bottom: 20px;\r
            line-height: 1.8;\r
        }\r
\r
        .params-table {\r
            margin-top: 20px;\r
        }\r
\r
        .params-table h4 {\r
            color: #f1f5f9;\r
            margin-bottom: 12px;\r
            font-size: 1rem;\r
        }\r
\r
        .param-row {\r
            background: var(--bg-secondary);\r
            padding: 12px 16px;\r
            border-radius: 8px;\r
            margin-bottom: 8px;\r
            display: grid;\r
            grid-template-columns: 160px 1fr;\r
            gap: 15px;\r
            align-items: start;\r
            border: 1px solid var(--border);\r
        }\r
\r
        .param-name {\r
            font-family: 'Courier New', monospace;\r
            color: #ff6b81;\r
            font-weight: 600;\r
            font-size: 0.95rem;\r
        }\r
\r
        .param-desc {\r
            color: #cbd5e1;\r
            font-size: 0.9rem;\r
        }\r
\r
        .example-section {\r
            margin-top: 25px;\r
            padding-top: 25px;\r
            border-top: 1px solid var(--border);\r
        }\r
\r
        .example-section h4 {\r
            color: #f1f5f9;\r
            margin-bottom: 15px;\r
            font-size: 1rem;\r
        }\r
\r
        .code-block {\r
            background: var(--code-bg);\r
            border: 1px solid var(--border);\r
            border-radius: 8px;\r
            padding: 16px;\r
            padding-top: 40px;\r
            margin: 10px 0;\r
            position: relative;\r
        }\r
\r
        .code-block pre {\r
            margin: 0;\r
            font-family: 'Courier New', monospace;\r
            font-size: 0.85rem;\r
            color: #f1f5f9;\r
            overflow-x: auto;\r
        }\r
\r
        .code-copy-btn {\r
            position: absolute;\r
            top: 8px;\r
            right: 8px;\r
            padding: 8px;\r
            background: var(--red-indonesia);\r
            color: white;\r
            border: none;\r
            border-radius: 6px;\r
            cursor: pointer;\r
            transition: all 0.3s ease;\r
            opacity: 0.85;\r
            display: flex;\r
            align-items: center;\r
            justify-content: center;\r
            width: 32px;\r
            height: 32px;\r
        }\r
\r
        .code-copy-btn:hover {\r
            opacity: 1;\r
            transform: scale(1.05);\r
            background: #ff6b81;\r
            box-shadow: 0 4px 12px var(--red-glow);\r
        }\r
\r
        .code-copy-btn.copied {\r
            background: #10b981;\r
        }\r
\r
        .copy-icon {\r
            width: 16px;\r
            height: 16px;\r
            display: inline-block;\r
        }\r
\r
        .code-label {\r
            position: absolute;\r
            top: 8px;\r
            left: 15px;\r
            background: #1e293b;\r
            padding: 4px 12px;\r
            border-radius: 6px;\r
            font-size: 0.75rem;\r
            color: #94a3b8;\r
            font-weight: 600;\r
            border: 1px solid #334155;\r
        }\r
\r
        /* Features Section */\r
        .features-grid {\r
            display: grid;\r
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));\r
            gap: 25px;\r
            margin: 40px 0;\r
        }\r
\r
        .feature-card {\r
            background: var(--bg-card);\r
            border: 1px solid var(--border);\r
            border-radius: 16px;\r
            padding: 30px;\r
            text-align: center;\r
            transition: all 0.3s ease;\r
            animation: fadeIn 0.8s ease-out both;\r
        }\r
\r
        .feature-card:nth-child(1) { animation-delay: 0.5s; }\r
        .feature-card:nth-child(2) { animation-delay: 0.6s; }\r
        .feature-card:nth-child(3) { animation-delay: 0.7s; }\r
\r
        .feature-card:hover {\r
            transform: translateY(-5px);\r
            border-color: var(--red-indonesia);\r
            box-shadow: 0 8px 24px rgba(231, 76, 60, 0.2);\r
        }\r
\r
        .feature-icon {\r
            width: 70px;\r
            height: 70px;\r
            margin: 0 auto 20px;\r
            background: var(--red-indonesia);\r
            border-radius: 16px;\r
            display: flex;\r
            align-items: center;\r
            justify-content: center;\r
            font-size: 2rem;\r
        }\r
\r
        .feature-card h3 {\r
            font-size: 1.3rem;\r
            margin-bottom: 12px;\r
            color: #f1f5f9;\r
        }\r
\r
        .feature-card p {\r
            color: #cbd5e1;\r
            line-height: 1.7;\r
        }\r
\r
        /* Footer */\r
        footer {\r
            margin-top: 80px;\r
            padding: 40px 0;\r
            border-top: 1px solid var(--border);\r
            text-align: center;\r
        }\r
\r
        .footer-content {\r
            color: var(--text-muted);\r
            margin-bottom: 20px;\r
        }\r
\r
        .footer-links {\r
            display: flex;\r
            gap: 30px;\r
            justify-content: center;\r
            flex-wrap: wrap;\r
            margin-bottom: 25px;\r
        }\r
\r
        .footer-link {\r
            color: #cbd5e1;\r
            text-decoration: none;\r
            font-weight: 500;\r
            transition: all 0.3s ease;\r
            display: inline-flex;\r
            align-items: center;\r
            gap: 8px;\r
        }\r
\r
        .footer-link:hover {\r
            color: var(--red-indonesia);\r
            transform: translateY(-2px);\r
        }\r
\r
        /* Responsive */\r
        @media (max-width: 768px) {\r
            h1 {\r
                font-size: 2.5rem;\r
            }\r
\r
            .tagline {\r
                font-size: 1.1rem;\r
            }\r
\r
            .quick-try {\r
                padding: 25px 20px;\r
            }\r
\r
            .quick-try h2 {\r
                font-size: 1.5rem;\r
            }\r
\r
            .try-buttons {\r
                grid-template-columns: 1fr;\r
                gap: 10px;\r
            }\r
\r
            .try-btn {\r
                padding: 12px 18px;\r
                font-size: 0.9rem;\r
                text-align: center;\r
            }\r
\r
            .endpoint-display {\r
                flex-direction: column;\r
                align-items: stretch;\r
                padding: 15px;\r
            }\r
\r
            .endpoint-url {\r
                padding-left: 15px;\r
                padding-top: 40px;\r
                font-size: 0.85rem;\r
                word-break: break-all;\r
            }\r
\r
            .endpoint-display::before {\r
                top: 0;\r
                left: 0;\r
                right: 0;\r
                bottom: auto;\r
                height: 30px;\r
                width: 100%;\r
                padding: 0;\r
                justify-content: center;\r
            }\r
\r
            .copy-btn {\r
                width: 100%;\r
                padding: 10px;\r
                margin-top: 10px;\r
            }\r
\r
            .response-box {\r
                padding: 15px;\r
                font-size: 0.85rem;\r
                max-height: 300px;\r
            }\r
\r
            .param-row {\r
                grid-template-columns: 1fr;\r
                gap: 8px;\r
            }\r
\r
            .section-header h2 {\r
                font-size: 2rem;\r
            }\r
\r
            .endpoint-card {\r
                padding: 20px;\r
            }\r
\r
            .endpoint-card h3 {\r
                font-size: 1.1rem;\r
                flex-direction: column;\r
                align-items: flex-start;\r
                gap: 8px;\r
            }\r
\r
            .endpoint-path {\r
                font-size: 0.85rem;\r
                padding: 10px 12px;\r
            }\r
\r
            .code-block {\r
                padding: 12px;\r
            }\r
\r
            .code-block pre {\r
                font-size: 0.75rem;\r
            }\r
\r
            .features-grid {\r
                grid-template-columns: 1fr;\r
            }\r
\r
            .badges {\r
                gap: 10px;\r
            }\r
\r
            .badge {\r
                font-size: 0.85rem;\r
                padding: 6px 12px;\r
            }\r
\r
            .footer-links {\r
                flex-direction: column;\r
                gap: 15px;\r
            }\r
        }\r
\r
        @media (max-width: 480px) {\r
            h1 {\r
                font-size: 2rem;\r
                letter-spacing: -1px;\r
            }\r
\r
            .logo-icon {\r
                width: 50px;\r
                height: 50px;\r
                font-size: 28px;\r
            }\r
\r
            .tagline {\r
                font-size: 1rem;\r
            }\r
\r
            .quick-try {\r
                padding: 20px 15px;\r
            }\r
\r
            .quick-try h2 {\r
                font-size: 1.3rem;\r
            }\r
\r
            .quick-try p {\r
                font-size: 0.9rem;\r
            }\r
\r
            .try-btn {\r
                padding: 10px 16px;\r
                font-size: 0.85rem;\r
            }\r
\r
            .endpoint-display {\r
                padding: 12px;\r
            }\r
\r
            .endpoint-url {\r
                font-size: 0.75rem;\r
                padding-top: 35px;\r
            }\r
\r
            .response-box {\r
                padding: 12px;\r
                font-size: 0.8rem;\r
                max-height: 250px;\r
            }\r
\r
            .section-header h2 {\r
                font-size: 1.6rem;\r
            }\r
\r
            .section-header p {\r
                font-size: 0.95rem;\r
            }\r
\r
            .endpoint-card {\r
                padding: 18px;\r
            }\r
\r
            .endpoint-card h3 {\r
                font-size: 1rem;\r
            }\r
\r
            .endpoint-path {\r
                font-size: 0.8rem;\r
                padding: 8px 10px;\r
            }\r
\r
            .code-block pre {\r
                font-size: 0.7rem;\r
            }\r
\r
            .feature-icon {\r
                width: 60px;\r
                height: 60px;\r
                font-size: 1.8rem;\r
            }\r
\r
            .feature-card h3 {\r
                font-size: 1.1rem;\r
            }\r
\r
            .feature-card p {\r
                font-size: 0.9rem;\r
            }\r
        }\r
\r
        /* Custom Scrollbar */\r
        ::-webkit-scrollbar {\r
            width: 10px;\r
        }\r
\r
        ::-webkit-scrollbar-track {\r
            background: var(--bg-secondary);\r
        }\r
\r
        ::-webkit-scrollbar-thumb {\r
            background: var(--red-indonesia);\r
            border-radius: 5px;\r
        }\r
\r
        ::-webkit-scrollbar-thumb:hover {\r
            background: var(--accent-dark);\r
        }\r
\r
        .json-key { color: #93c5fd; font-weight: 600; }\r
        .json-string { color: #86efac; }\r
        .json-number { color: #fde047; }\r
        .json-boolean { color: #f472b6; }\r
\r
        /* Override speed-highlight theme for code blocks */\r
        .code-block pre {\r
            background: transparent !important;\r
            margin: 0;\r
        }\r
\r
        .code-block pre code {\r
            font-family: 'Courier New', monospace;\r
            font-size: 0.85rem;\r
            background: transparent !important;\r
            color: #e2e8f0;\r
            display: block;\r
            padding: 0;\r
        }\r
\r
        .code-block .shj-syn-kwd { color: #c678dd; font-weight: 600; }\r
        .code-block .shj-syn-cmnt { color: var(--text-muted); font-style: italic; }\r
        .code-block .shj-syn-str { color: #98c379; }\r
        .code-block .shj-syn-num { color: #d19a66; }\r
        .code-block .shj-syn-func { color: #61afef; }\r
        .code-block .shj-syn-oper { color: #56b6c2; }\r
        .code-block .shj-syn-var { color: #e06c75; }\r
        .code-block .shj-syn-class { color: #e5c07b; }\r
        .code-block .shj-syn-insert { color: #e2e8f0; background: transparent; }\r
    </style>\r
</head>\r
<body>\r
    <div class="bg-decoration"></div>\r
\r
    <div class="container">\r
        <header>\r
            <div class="logo">\r
                <div class="logo-icon">\u{1F1EE}\u{1F1E9}</div>\r
            </div>\r
            <h1>API Hari Libur</h1>\r
            <p class="tagline">Karena developer juga butuh tahu kapan <strong>tanggal merah</strong> \u{1F1EE}\u{1F1E9}</p>\r
            <div class="badges">\r
                <div class="badge">\r
                    <span>\u{1F1EE}\u{1F1E9}</span>\r
                    <span>Data Indonesia</span>\r
                </div>\r
                <div class="badge">\r
                    <span>\u26A1</span>\r
                    <span>Gratis & Cepat</span>\r
                </div>\r
                <div class="badge">\r
                    <span>\u{1F513}</span>\r
                    <span>No API Key</span>\r
                </div>\r
                <div class="badge">\r
                    <span>\u{1F4F1}</span>\r
                    <span>REST API</span>\r
                </div>\r
            </div>\r
        </header>\r
\r
        <!-- Quick Try Section -->\r
        <section class="quick-try">\r
            <h2>\u{1F680} Coba Langsung</h2>\r
            <p>Pilih endpoint di bawah untuk melihat response secara real-time</p>\r
\r
            <div class="try-buttons">\r
                <button class="try-btn active" data-endpoint="/api">Tahun Ini</button>\r
                <button class="try-btn" data-endpoint="/api?year=2024">Tahun 2024</button>\r
                <button class="try-btn" data-endpoint="/api?month=12">Bulan Ini</button>\r
                <button class="try-btn" data-endpoint="/api?year=2024&month=12">Des 2024</button>\r
                <button class="try-btn" data-endpoint="/api/today">Hari Ini</button>\r
                <button class="try-btn" data-endpoint="/api/tomorrow">Besok</button>\r
            </div>\r
\r
            <div class="endpoint-display">\r
                <div class="endpoint-url" id="currentEndpoint">Loading...</div>\r
                <button class="copy-btn" onclick="copyEndpoint()" title="Copy URL">\r
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>\r
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>\r
                    </svg>\r
                </button>\r
            </div>\r
\r
            <div class="response-box" id="responseBox">\r
                <div class="loading">\r
                    <div class="spinner"></div>\r
                    <p>Klik salah satu tombol di atas untuk melihat response...</p>\r
                </div>\r
            </div>\r
        </section>\r
\r
        <!-- Documentation Section -->\r
        <section class="docs-section">\r
            <div class="section-header">\r
                <h2>\u{1F4DA} Dokumentasi API</h2>\r
                <p>Panduan lengkap untuk menggunakan API Hari Libur Indonesia</p>\r
            </div>\r
\r
            <div class="endpoint-grid">\r
                <!-- Endpoint 1 -->\r
                <div class="endpoint-card">\r
                    <h3>\r
                        <span class="method-badge">GET</span>\r
                        Semua Libur Tahun Ini\r
                    </h3>\r
                    <div class="endpoint-path">/api</div>\r
                    <p class="endpoint-desc">\r
                        Mendapatkan daftar semua hari libur dan cuti bersama pada tahun berjalan.\r
                    </p>\r
                    <div class="example-section">\r
                        <h4>\u{1F4A1} Contoh Request</h4>\r
                        <div class="code-block">\r
                            <span class="code-label">JavaScript</span>\r
                            <pre class="api-code">fetch('{{BASE_URL}}/api')\r
  .then(res => res.json())\r
  .then(data => console.log(data));</pre>\r
                        </div>\r
                    </div>\r
                </div>\r
\r
                <!-- Endpoint 2 -->\r
                <div class="endpoint-card">\r
                    <h3>\r
                        <span class="method-badge">GET</span>\r
                        Libur Tahun Tertentu\r
                    </h3>\r
                    <div class="endpoint-path">/api?year={tahun}</div>\r
                    <p class="endpoint-desc">\r
                        Mendapatkan daftar hari libur pada tahun yang ditentukan.\r
                    </p>\r
                    <div class="params-table">\r
                        <h4>\u{1F4CB} Parameters</h4>\r
                        <div class="param-row">\r
                            <div class="param-name">year</div>\r
                            <div class="param-desc">Tahun yang ingin dicari (contoh: 2024)</div>\r
                        </div>\r
                    </div>\r
                    <div class="example-section">\r
                        <h4>\u{1F4A1} Contoh Request</h4>\r
                        <div class="code-block">\r
                            <span class="code-label">JavaScript</span>\r
                            <pre class="api-code">const year = 2024;\r
\r
fetch(\`{{BASE_URL}}/api?year=\${year}\`)\r
  .then(res => res.json())\r
  .then(data => console.log(data));</pre>\r
                        </div>\r
                    </div>\r
                </div>\r
\r
                <!-- Endpoint 3 -->\r
                <div class="endpoint-card">\r
                    <h3>\r
                        <span class="method-badge">GET</span>\r
                        Libur Bulan Tertentu\r
                    </h3>\r
                    <div class="endpoint-path">/api?month={bulan}</div>\r
                    <p class="endpoint-desc">\r
                        Mendapatkan daftar hari libur pada bulan tertentu di tahun berjalan.\r
                    </p>\r
                    <div class="params-table">\r
                        <h4>\u{1F4CB} Parameters</h4>\r
                        <div class="param-row">\r
                            <div class="param-name">month</div>\r
                            <div class="param-desc">Bulan (1-12, contoh: 8 untuk Agustus)</div>\r
                        </div>\r
                    </div>\r
                    <div class="example-section">\r
                        <h4>\u{1F4A1} Contoh Request</h4>\r
                        <div class="code-block">\r
                            <span class="code-label">JavaScript</span>\r
                            <pre class="api-code">const month = 8; // Agustus\r
\r
fetch(\`{{BASE_URL}}/api?month=\${month}\`)\r
  .then(res => res.json())\r
  .then(data => console.log(data));</pre>\r
                        </div>\r
                    </div>\r
                </div>\r
\r
                <!-- Endpoint 4 -->\r
                <div class="endpoint-card">\r
                    <h3>\r
                        <span class="method-badge">GET</span>\r
                        Libur Bulan & Tahun\r
                    </h3>\r
                    <div class="endpoint-path">/api?year={tahun}&month={bulan}</div>\r
                    <p class="endpoint-desc">\r
                        Mendapatkan daftar hari libur pada bulan dan tahun yang spesifik.\r
                    </p>\r
                    <div class="params-table">\r
                        <h4>\u{1F4CB} Parameters</h4>\r
                        <div class="param-row">\r
                            <div class="param-name">year</div>\r
                            <div class="param-desc">Tahun yang ingin dicari</div>\r
                        </div>\r
                        <div class="param-row">\r
                            <div class="param-name">month</div>\r
                            <div class="param-desc">Bulan (1-12)</div>\r
                        </div>\r
                    </div>\r
                    <div class="example-section">\r
                        <h4>\u{1F4A1} Contoh Request</h4>\r
                        <div class="code-block">\r
                            <span class="code-label">JavaScript</span>\r
                            <pre class="api-code">const year = 2024;\r
const month = 8;\r
\r
fetch(\`{{BASE_URL}}/api?year=\${year}&month=\${month}\`)\r
  .then(res => res.json())\r
  .then(data => console.log(data));</pre>\r
                        </div>\r
                    </div>\r
                </div>\r
\r
                <!-- Endpoint 5 -->\r
                <div class="endpoint-card">\r
                    <h3>\r
                        <span class="method-badge">GET</span>\r
                        Cek Tanggal Spesifik\r
                    </h3>\r
                    <div class="endpoint-path">/api?year={tahun}&month={bulan}&day={hari}</div>\r
                    <p class="endpoint-desc">\r
                        Mengecek apakah tanggal tertentu adalah hari libur atau bukan.\r
                    </p>\r
                    <div class="params-table">\r
                        <h4>\u{1F4CB} Parameters</h4>\r
                        <div class="param-row">\r
                            <div class="param-name">year</div>\r
                            <div class="param-desc">Tahun</div>\r
                        </div>\r
                        <div class="param-row">\r
                            <div class="param-name">month</div>\r
                            <div class="param-desc">Bulan (1-12)</div>\r
                        </div>\r
                        <div class="param-row">\r
                            <div class="param-name">day</div>\r
                            <div class="param-desc">Tanggal (1-31)</div>\r
                        </div>\r
                    </div>\r
                    <div class="example-section">\r
                        <h4>\u{1F4A1} Contoh Request</h4>\r
                        <div class="code-block">\r
                            <span class="code-label">JavaScript</span>\r
                            <pre class="api-code">const year = 2024;\r
const month = 8;\r
const day = 17;\r
\r
fetch(\`{{BASE_URL}}/api?year=\${year}&month=\${month}&day=\${day}\`)\r
  .then(res => res.json())\r
  .then(data => {\r
    if (data.is_holiday) {\r
      console.log('\u{1F389} Tanggal ini libur!');\r
      console.log('Libur:', data.holiday_list.join(', '));\r
      console.log('Libur Nasional:', data.is_national_holiday ? 'Ya' : 'Cuti Bersama');\r
    } else {\r
      console.log('\u{1F4BC} Bukan hari libur');\r
    }\r
  });</pre>\r
                        </div>\r
                    </div>\r
                </div>\r
\r
                <!-- Endpoint 6 -->\r
                <div class="endpoint-card">\r
                    <h3>\r
                        <span class="method-badge">GET</span>\r
                        Cek Hari Ini\r
                    </h3>\r
                    <div class="endpoint-path">/api/today</div>\r
                    <p class="endpoint-desc">\r
                        Mengecek apakah hari ini adalah hari libur atau tidak.\r
                    </p>\r
                    <div class="example-section">\r
                        <h4>\u{1F4A1} Contoh Request</h4>\r
                        <div class="code-block">\r
                            <span class="code-label">JavaScript</span>\r
                            <pre class="api-code">fetch('{{BASE_URL}}/api/today')\r
  .then(res => res.json())\r
  .then(data => {\r
    if (data.is_holiday) {\r
      console.log('\u{1F389} Hari ini libur!');\r
      console.log('Libur:', data.holiday_list.join(', '));\r
      console.log('Libur Nasional:', data.is_national_holiday ? 'Ya' : 'Cuti Bersama');\r
    } else {\r
      console.log('\u{1F4BC} Hari ini kerja');\r
    }\r
  });</pre>\r
                        </div>\r
                    </div>\r
                </div>\r
\r
                <!-- Endpoint 7 -->\r
                <div class="endpoint-card">\r
                    <h3>\r
                        <span class="method-badge">GET</span>\r
                        Cek Besok\r
                    </h3>\r
                    <div class="endpoint-path">/api/tomorrow</div>\r
                    <p class="endpoint-desc">\r
                        Mengecek apakah besok adalah hari libur atau tidak.\r
                    </p>\r
                    <div class="example-section">\r
                        <h4>\u{1F4A1} Contoh Request</h4>\r
                        <div class="code-block">\r
                            <span class="code-label">JavaScript</span>\r
                            <pre class="api-code">fetch('{{BASE_URL}}/api/tomorrow')\r
  .then(res => res.json())\r
  .then(data => {\r
    if (data.is_holiday) {\r
      console.log('\u{1F389} Besok libur!');\r
      console.log('Libur:', data.holiday_list.join(', '));\r
      console.log('Libur Nasional:', data.is_national_holiday ? 'Ya' : 'Cuti Bersama');\r
    } else {\r
      console.log('\u{1F4BC} Besok masih kerja');\r
    }\r
  });</pre>\r
                        </div>\r
                    </div>\r
                </div>\r
            </div>\r
        </section>\r
\r
        <!-- Response Format Section -->\r
        <section class="docs-section">\r
            <div class="section-header">\r
                <h2>\u{1F4CA} Format Response</h2>\r
                <p>Struktur data yang dikembalikan oleh API</p>\r
            </div>\r
\r
            <div class="endpoint-card">\r
                <h3>Response untuk List Hari Libur</h3>\r
                <p class="endpoint-desc">\r
                    Endpoint yang mengembalikan daftar hari libur akan memberikan array of objects dengan struktur berikut:\r
                </p>\r
                <div class="code-block">\r
                    <span class="code-label">JSON</span>\r
                    <pre>[\r
  {\r
    <span class="json-key">"date"</span>: <span class="json-string">"2026-01-01"</span>,\r
    <span class="json-key">"name"</span>: <span class="json-string">"Tahun Baru 2026 Masehi"</span>,\r
    <span class="json-key">"is_national_holiday"</span>: <span class="json-boolean">true</span>\r
  },\r
  {\r
    <span class="json-key">"date"</span>: <span class="json-string">"2026-01-16"</span>,\r
    <span class="json-key">"name"</span>: <span class="json-string">"Isra Mikraj Nabi Muhammad S.A.W."</span>,\r
    <span class="json-key">"is_national_holiday"</span>: <span class="json-boolean">true</span>\r
  },\r
  {\r
    <span class="json-key">"date"</span>: <span class="json-string">"2026-08-17"</span>,\r
    <span class="json-key">"name"</span>: <span class="json-string">"Proklamasi Kemerdekaan"</span>,\r
    <span class="json-key">"is_national_holiday"</span>: <span class="json-boolean">true</span>\r
  }\r
]</pre>\r
                </div>\r
\r
                <div class="params-table" style="margin-top: 25px;">\r
                    <h4>\u{1F4CB} Field Descriptions</h4>\r
                    <div class="param-row">\r
                        <div class="param-name">date</div>\r
                        <div class="param-desc">Tanggal libur dalam format YYYY-MM-DD</div>\r
                    </div>\r
                    <div class="param-row">\r
                        <div class="param-name">name</div>\r
                        <div class="param-desc">Nama hari libur atau cuti bersama</div>\r
                    </div>\r
                    <div class="param-row">\r
                        <div class="param-name">is_national_holiday</div>\r
                        <div class="param-desc">Boolean - true jika hari libur nasional, false jika cuti bersama</div>\r
                    </div>\r
                </div>\r
            </div>\r
\r
            <div class="endpoint-card" style="margin-top: 25px;">\r
                <h3>Response untuk Cek Tanggal (today/tomorrow/specific date)</h3>\r
                <p class="endpoint-desc">\r
                    Endpoint /api/today, /api/tomorrow, dan query dengan parameter lengkap (year, month, day) menggunakan format yang sama:\r
                </p>\r
                <div class="code-block">\r
                    <span class="code-label">JSON - Jika Libur</span>\r
                    <pre>{\r
  <span class="json-key">"date"</span>: <span class="json-string">"2026-08-17"</span>,\r
  <span class="json-key">"is_holiday"</span>: <span class="json-boolean">true</span>,\r
  <span class="json-key">"is_national_holiday"</span>: <span class="json-boolean">true</span>,\r
  <span class="json-key">"holiday_list"</span>: [<span class="json-string">"Proklamasi Kemerdekaan"</span>]\r
}</pre>\r
                </div>\r
\r
                <div class="code-block">\r
                    <span class="code-label">JSON - Jika Bukan Libur</span>\r
                    <pre>{\r
  <span class="json-key">"date"</span>: <span class="json-string">"2026-01-13"</span>,\r
  <span class="json-key">"is_holiday"</span>: <span class="json-boolean">false</span>,\r
  <span class="json-key">"is_national_holiday"</span>: <span class="json-boolean">false</span>,\r
  <span class="json-key">"holiday_list"</span>: []\r
}</pre>\r
                </div>\r
\r
                <div class="params-table" style="margin-top: 25px;">\r
                    <h4>\u{1F4CB} Field Descriptions</h4>\r
                    <div class="param-row">\r
                        <div class="param-name">date</div>\r
                        <div class="param-desc">Tanggal yang dicek dalam format YYYY-MM-DD</div>\r
                    </div>\r
                    <div class="param-row">\r
                        <div class="param-name">is_holiday</div>\r
                        <div class="param-desc">Boolean - true jika tanggal tersebut adalah hari libur/cuti</div>\r
                    </div>\r
                    <div class="param-row">\r
                        <div class="param-name">is_national_holiday</div>\r
                        <div class="param-desc">Boolean - true jika terdapat hari libur nasional (bukan cuti bersama)</div>\r
                    </div>\r
                    <div class="param-row">\r
                        <div class="param-name">holiday_list</div>\r
                        <div class="param-desc">Array of string - Daftar nama hari libur (kosong jika bukan libur)</div>\r
                    </div>\r
                </div>\r
            </div>\r
        </section>\r
\r
        <!-- Features Section -->\r
        <section class="docs-section">\r
            <div class="section-header">\r
                <h2>\u2728 Kenapa Pakai API Ini?</h2>\r
            </div>\r
\r
            <div class="features-grid">\r
                <div class="feature-card">\r
                    <div class="feature-icon">\u{1F680}</div>\r
                    <h3>Mudah Digunakan</h3>\r
                    <p>Tidak perlu API key, tidak perlu registrasi. Langsung pakai dan integrasikan ke aplikasi Anda.</p>\r
                </div>\r
                <div class="feature-card">\r
                    <div class="feature-icon">\u{1F4C5}</div>\r
                    <h3>Data Akurat</h3>\r
                    <p>Data hari libur dan cuti bersama resmi dari pemerintah Indonesia, selalu up-to-date.</p>\r
                </div>\r
                <div class="feature-card">\r
                    <div class="feature-icon">\u26A1</div>\r
                    <h3>Performa Cepat</h3>\r
                    <p>Response time cepat dengan infrastruktur Deno Deploy yang reliable dan scalable.</p>\r
                </div>\r
            </div>\r
        </section>\r
\r
        <!-- Use Cases Section -->\r
        <section class="docs-section">\r
            <div class="section-header">\r
                <h2>\u{1F4A1} Use Cases</h2>\r
                <p>Ide penggunaan API ini dalam aplikasi Anda</p>\r
            </div>\r
\r
            <div class="endpoint-grid">\r
                <div class="endpoint-card">\r
                    <h3>\u{1F5D3}\uFE0F Aplikasi Kalender</h3>\r
                    <p class="endpoint-desc">\r
                        Tandai hari libur nasional dan cuti bersama secara otomatis di aplikasi kalender Anda.\r
                    </p>\r
                </div>\r
\r
                <div class="endpoint-card">\r
                    <h3>\u{1F4BC} HR Management System</h3>\r
                    <p class="endpoint-desc">\r
                        Integrasikan dengan sistem absensi untuk menghitung hari kerja efektif dan cuti karyawan.\r
                    </p>\r
                </div>\r
\r
                <div class="endpoint-card">\r
                    <h3>\u{1F4F1} Reminder App</h3>\r
                    <p class="endpoint-desc">\r
                        Kirim notifikasi sebelum hari libur untuk membantu planning aktivitas pengguna.\r
                    </p>\r
                </div>\r
\r
                <div class="endpoint-card">\r
                    <h3>\u{1F3E2} Scheduling System</h3>\r
                    <p class="endpoint-desc">\r
                        Hindari penjadwalan meeting atau event pada hari libur nasional.\r
                    </p>\r
                </div>\r
\r
                <div class="endpoint-card">\r
                    <h3>\u{1F4CA} Business Intelligence</h3>\r
                    <p class="endpoint-desc">\r
                        Analisis performa bisnis dengan memperhitungkan hari libur dalam laporan.\r
                    </p>\r
                </div>\r
\r
                <div class="endpoint-card">\r
                    <h3>\u{1F3AF} Project Management</h3>\r
                    <p class="endpoint-desc">\r
                        Hitung deadline dan estimasi proyek dengan akurat berdasarkan hari kerja.\r
                    </p>\r
                </div>\r
            </div>\r
        </section>\r
\r
        <!-- Footer -->\r
        <footer>\r
            <div class="footer-content">\r
                <p>Data hari libur bersumber dari <a href="https://tanggalans.com" target="_blank" style="color: var(--red-indonesia); text-decoration: none; font-weight: 600;">tanggalans.com</a> dan <a href="https://husniadil.com" target="_blank" style="color: var(--red-indonesia); text-decoration: none; font-weight: 600;">husniadil.com</a></p>\r
                <p style="margin-top: 10px;">Dibuat dengan \u2764\uFE0F untuk memudahkan developer Indonesia</p>\r
                <p style="margin-top: 8px; font-size: 0.85rem; color: var(--text-muted);">\r
                    Fork dari <a href="https://github.com/radyakaze/api-hari-libur" target="_blank" style="color: var(--text-muted); text-decoration: underline;">radyakaze/api-hari-libur</a>\r
                </p>\r
            </div>\r
            <div class="footer-links">\r
                <a href="https://github.com/afirmansyah26-code/api-hari-libur" target="_blank" class="footer-link">\r
                    <span>\u{1F4BB}</span>\r
                    <span>Source Code</span>\r
                </a>\r
                <a href="https://github.com/afirmansyah26-code/api-hari-libur/issues" target="_blank" class="footer-link">\r
                    <span>\u{1F41B}</span>\r
                    <span>Report Issue</span>\r
                </a>\r
                <a href="https://github.com/radyakaze/api-hari-libur" target="_blank" class="footer-link">\r
                    <span>\u{1F374}</span>\r
                    <span>Original Repo</span>\r
                </a>\r
                <a href="https://github.com/afirmansyah26-code" target="_blank" class="footer-link">\r
                    <span>\u{1F468}\u200D\u{1F4BB}</span>\r
                    <span>Developer</span>\r
                </a>\r
            </div>\r
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 20px;" id="copyright">\r
                \xA9 <span id="currentYear">2024</span> API Hari Libur Indonesia. Open Source Project.\r
            </p>\r
        </footer>\r
    </div>\r
\r
    <script>\r
        // Get BASE_URL from current page URL or fallback to production\r
        const BASE_URL = window.location.origin;\r
\r
        let currentEndpoint = '/api';\r
\r
        // Set current year dynamically\r
        document.getElementById('currentYear').textContent = new Date().getFullYear();\r
\r
        // Initialize\r
        document.addEventListener('DOMContentLoaded', () => {\r
            // Set initial endpoint display\r
            document.getElementById('currentEndpoint').textContent = BASE_URL + '/api';\r
\r
            // Replace {{BASE_URL}} placeholders in all code examples and apply highlighting\r
            document.querySelectorAll('.api-code').forEach(code => {\r
                const originalText = code.textContent;\r
\r
                // Replace BASE_URL only if it contains the placeholder\r
                if (originalText.includes('{{BASE_URL}}')) {\r
                    code.textContent = originalText.replace(/\\{\\{BASE_URL\\}\\}/g, BASE_URL);\r
                }\r
\r
                // Wrap in code tag if not already wrapped\r
                if (code.tagName !== 'CODE') {\r
                    const codeElement = document.createElement('code');\r
                    codeElement.className = 'language-js';\r
                    codeElement.textContent = code.textContent;\r
                    code.textContent = '';\r
                    code.appendChild(codeElement);\r
                }\r
\r
                // Apply syntax highlighting when library is loaded\r
                setTimeout(() => {\r
                    if (window.highlightCode) {\r
                        const codeElement = code.querySelector('code') || code;\r
                        window.highlightCode(codeElement, 'js');\r
                    }\r
                }, 100);\r
            });\r
\r
            fetchData('/api');\r
\r
            // Add click handlers to try buttons\r
            document.querySelectorAll('.try-btn').forEach(btn => {\r
                btn.addEventListener('click', function() {\r
                    document.querySelectorAll('.try-btn').forEach(b => b.classList.remove('active'));\r
                    this.classList.add('active');\r
                    const endpoint = this.getAttribute('data-endpoint');\r
                    currentEndpoint = endpoint;\r
                    document.getElementById('currentEndpoint').textContent = BASE_URL + endpoint;\r
                    fetchData(endpoint);\r
                });\r
            });\r
\r
            // Add copy functionality to all code blocks\r
            document.querySelectorAll('.code-block').forEach(block => {\r
                const pre = block.querySelector('pre');\r
                if (pre) {\r
                    const button = document.createElement('button');\r
                    button.className = 'code-copy-btn';\r
                    button.title = 'Copy code';\r
                    button.innerHTML = \`\r
                        <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>\r
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>\r
                        </svg>\r
                    \`;\r
                    button.onclick = () => copyCode(button, pre);\r
                    block.appendChild(button);\r
                }\r
            });\r
\r
            // Add copy functionality to endpoint paths\r
            document.querySelectorAll('.endpoint-path').forEach(path => {\r
                // Skip if already has copy structure\r
                if (path.querySelector('.endpoint-path-text')) return;\r
\r
                const text = path.textContent.trim();\r
                path.innerHTML = \`\r
                    <span class="endpoint-path-text">\${text}</span>\r
                    <svg class="endpoint-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>\r
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>\r
                    </svg>\r
                \`;\r
                path.onclick = () => copyEndpointPath(path, text);\r
                path.title = 'Click to copy full URL';\r
            });\r
        });\r
\r
        async function fetchData(endpoint) {\r
            const responseBox = document.getElementById('responseBox');\r
\r
            // Show loading\r
            responseBox.innerHTML = \`\r
                <div class="loading">\r
                    <div class="spinner"></div>\r
                    <p>Memuat data...</p>\r
                </div>\r
            \`;\r
\r
            try {\r
                const response = await fetch(BASE_URL + endpoint);\r
                const data = await response.json();\r
\r
                // Format and display JSON\r
                const formatted = JSON.stringify(data, null, 2);\r
                const highlighted = highlightJSON(formatted);\r
\r
                responseBox.innerHTML = \`<pre>\${highlighted}</pre>\`;\r
            } catch (error) {\r
                responseBox.innerHTML = \`\r
                    <div class="loading">\r
                        <p style="color: var(--red-indonesia);">\u274C Error: \${error.message}</p>\r
                        <p style="color: var(--text-muted); margin-top: 10px;">Pastikan endpoint tersedia dan coba lagi.</p>\r
                    </div>\r
                \`;\r
            }\r
        }\r
\r
        function highlightJSON(json) {\r
            return json\r
                .replace(/&/g, '&amp;')\r
                .replace(/</g, '&lt;')\r
                .replace(/>/g, '&gt;')\r
                .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')\r
                .replace(/: "([^"]+)"/g, ': <span class="json-string">"$1"</span>')\r
                .replace(/: (\\d+)/g, ': <span class="json-number">$1</span>')\r
                .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>');\r
        }\r
\r
        function copyEndpoint() {\r
            const endpoint = document.getElementById('currentEndpoint').textContent;\r
            const btn = document.querySelector('.copy-btn');\r
\r
            navigator.clipboard.writeText(endpoint).then(() => {\r
                btn.innerHTML = \`\r
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                        <polyline points="20 6 9 17 4 12"></polyline>\r
                    </svg>\r
                \`;\r
                btn.title = 'Copied!';\r
                btn.style.background = '#27ae60';\r
\r
                setTimeout(() => {\r
                    btn.innerHTML = \`\r
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>\r
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>\r
                        </svg>\r
                    \`;\r
                    btn.title = 'Copy URL';\r
                    btn.style.background = 'var(--red-indonesia)';\r
                }, 2000);\r
            }).catch(err => {\r
                console.error('Failed to copy:', err);\r
                btn.innerHTML = \`\r
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                        <circle cx="12" cy="12" r="10"></circle>\r
                        <line x1="15" y1="9" x2="9" y2="15"></line>\r
                        <line x1="9" y1="9" x2="15" y2="15"></line>\r
                    </svg>\r
                \`;\r
                btn.title = 'Failed to copy';\r
                setTimeout(() => {\r
                    btn.innerHTML = \`\r
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>\r
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>\r
                        </svg>\r
                    \`;\r
                    btn.title = 'Copy URL';\r
                }, 2000);\r
            });\r
        }\r
\r
        function copyCode(button, pre) {\r
            // Get text content without HTML tags\r
            const code = pre.textContent;\r
\r
            navigator.clipboard.writeText(code).then(() => {\r
                button.innerHTML = \`\r
                    <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                        <polyline points="20 6 9 17 4 12"></polyline>\r
                    </svg>\r
                \`;\r
                button.title = 'Copied!';\r
                button.classList.add('copied');\r
\r
                setTimeout(() => {\r
                    button.innerHTML = \`\r
                        <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>\r
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>\r
                        </svg>\r
                    \`;\r
                    button.title = 'Copy code';\r
                    button.classList.remove('copied');\r
                }, 2000);\r
            }).catch(err => {\r
                console.error('Failed to copy:', err);\r
                button.innerHTML = \`\r
                    <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                        <circle cx="12" cy="12" r="10"></circle>\r
                        <line x1="15" y1="9" x2="9" y2="15"></line>\r
                        <line x1="9" y1="9" x2="15" y2="15"></line>\r
                    </svg>\r
                \`;\r
                button.title = 'Failed to copy';\r
                setTimeout(() => {\r
                    button.innerHTML = \`\r
                        <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>\r
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>\r
                        </svg>\r
                    \`;\r
                    button.title = 'Copy code';\r
                }, 2000);\r
            });\r
        }\r
\r
        function copyEndpointPath(element, path) {\r
            // Add full URL with base\r
            const fullUrl = BASE_URL + path;\r
            const icon = element.querySelector('.endpoint-copy-icon');\r
\r
            navigator.clipboard.writeText(fullUrl).then(() => {\r
                icon.outerHTML = \`\r
                    <svg class="endpoint-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                        <polyline points="20 6 9 17 4 12"></polyline>\r
                    </svg>\r
                \`;\r
                element.style.background = 'rgba(39, 174, 96, 0.25)';\r
                element.style.borderColor = '#27ae60';\r
                element.title = 'Copied!';\r
\r
                setTimeout(() => {\r
                    const newIcon = element.querySelector('.endpoint-copy-icon');\r
                    if (newIcon) {\r
                        newIcon.outerHTML = \`\r
                            <svg class="endpoint-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\r
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>\r
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>\r
                            </svg>\r
                        \`;\r
                    }\r
                    element.style.background = '';\r
                    element.style.borderColor = '';\r
                    element.title = 'Click to copy full URL';\r
                }, 2000);\r
            }).catch(err => {\r
                console.error('Failed to copy:', err);\r
            });\r
        }\r
    </script>\r
\r
    <!-- Speed Highlight JS -->\r
    <script type="module">\r
        import { highlightElement } from 'https://unpkg.com/@speed-highlight/core/dist/index.js';\r
\r
        // Export to global scope for use in main script\r
        window.highlightCode = highlightElement;\r
    </script>\r
</body>\r
</html>\r
`;

// src/app.ts
function createApp(options) {
  const aggregator = options?.aggregator ?? new HolidayAggregatorService(holidayProviders);
  const nowProvider = options?.nowProvider ?? (() => /* @__PURE__ */ new Date());
  const app2 = new Hono();
  app2.use("*", logger());
  app2.use(
    "/api/*",
    cors({
      origin: "*",
      allowMethods: ["GET"]
    })
  );
  app2.use("/api/*", async (c, next) => {
    await next();
    if (c.req.method === "GET" && c.res.status === 200) {
      c.header(
        "Cache-Control",
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
      );
    }
  });
  app2.onError((err, c) => {
    if (err instanceof HTTPException2) {
      return c.json(
        {
          message: err.message,
          errors: err.cause
        },
        err.status
      );
    }
    console.error("Unhandled app error:", err);
    return c.json(
      {
        message: "Failed to retrieve holiday data."
      },
      500
    );
  });
  app2.get("/", (c) => {
    return c.html(LANDING_PAGE_HTML);
  });
  app2.get("/index.html", (c) => {
    return c.html(LANDING_PAGE_HTML);
  });
  app2.get("/api", zValidator("query", dateSchema), async (c) => {
    const yearQuery = c.req.query("year");
    const monthQuery = c.req.query("month");
    const dayQuery = c.req.query("day");
    const year = yearQuery ? parseInt(yearQuery, 10) : getJakartaDate(nowProvider()).year;
    const holidays = await aggregator.getHolidays(year);
    if (dayQuery && monthQuery) {
      const monthPadded = monthQuery.padStart(2, "0");
      const dayPadded = dayQuery.padStart(2, "0");
      const formattedDate = `${year}-${monthPadded}-${dayPadded}`;
      const dayHolidays = holidays.filter((h) => h.date === formattedDate);
      const holidayList = dayHolidays.map((h) => h.name);
      const isNational = dayHolidays.some((h) => h.isNationalHoliday);
      return c.json({
        date: formattedDate,
        is_holiday: holidayList.length > 0,
        is_national_holiday: isNational,
        holiday_list: holidayList
      });
    }
    if (monthQuery) {
      const monthPadded = monthQuery.padStart(2, "0");
      const prefix = `${year}-${monthPadded}`;
      const monthHolidays = holidays.filter((h) => h.date.startsWith(prefix));
      const responseDto2 = monthHolidays.map((h) => ({
        name: h.name,
        date: h.date,
        is_national_holiday: h.isNationalHoliday
      }));
      return c.json(responseDto2);
    }
    const responseDto = holidays.map((h) => ({
      name: h.name,
      date: h.date,
      is_national_holiday: h.isNationalHoliday
    }));
    return c.json(responseDto);
  });
  app2.get("/api/today", async (c) => {
    const today = getJakartaDate(nowProvider());
    const holidays = await aggregator.getHolidays(today.year);
    const dayHolidays = holidays.filter((h) => h.date === today.dateString);
    const holidayList = dayHolidays.map((h) => h.name);
    const isNational = dayHolidays.some((h) => h.isNationalHoliday);
    return c.json({
      date: today.dateString,
      is_holiday: holidayList.length > 0,
      is_national_holiday: isNational,
      holiday_list: holidayList
    });
  });
  app2.get("/api/tomorrow", async (c) => {
    const tomorrow = getJakartaTomorrow(nowProvider());
    const holidays = await aggregator.getHolidays(tomorrow.year);
    const dayHolidays = holidays.filter((h) => h.date === tomorrow.dateString);
    const holidayList = dayHolidays.map((h) => h.name);
    const isNational = dayHolidays.some((h) => h.isNationalHoliday);
    return c.json({
      date: tomorrow.dateString,
      is_holiday: holidayList.length > 0,
      is_national_holiday: isNational,
      holiday_list: holidayList
    });
  });
  return app2;
}
var app = createApp();

// src/entry-vercel.ts
var entry_vercel_default = handle(app);
export {
  entry_vercel_default as default
};
