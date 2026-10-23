import { toWeekly } from '../resample.ts'
import { analyzeVolume, type VolumeRead } from './volume.ts'
import { analyzeStructure, type StructureRead } from './structure.ts'
import { findLevels, type LevelsRead } from './levels.ts'
import { analyzeLiquidity, type FreeFloatInput, type LiquidityRead } from './liquidity.ts'
import { analyzeVpa, type VpaRead } from './vpa.ts'
import { analyzeWyckoff, type WyckoffRead } from './wyckoff.ts'
import { analyzeFlow, type FlowRead, type ForeignDay } from './flow.ts'
import { analyzeStrength, type StrengthRead } from './strength.ts'
import { analyzeFilters, type FiltersRead } from './filters.ts'
import { analyzeRiskReward, type RiskRewardRead } from './riskreward.ts'
import { atr } from './volatility.ts'
import { metric, unavailable, type Metric } from './metric.ts'
import type { Bar, VolumeProfile } from '../types.ts'

/**
 * Kolom pemeringkat — HANYA yang terukur.
 *
 * Wyckoff (#7) dan VPA (#6) sengaja TIDAK ada di sini. Keduanya tafsir; kalau ikut
 * dirata-rata, keyakinan yang tidak ditanggung metodenya akan menyusup ke angka
 * yang terlihat presisi.
 */
export const RANK_COLUMNS = ['trend', 'rs60', 'rvol', 'asing'] as const
export type RankColumn = (typeof RANK_COLUMNS)[number]

export const ATR_PERIOD = 14

export interface ScanInput {
  code: string
  name: string
  /** Riwayat penuh termasuk pemanasan MA. */
  bars: Bar[]
  /** Jendela yang digambar dan dianalisis. */
  displayBars: Bar[]
  profile: VolumeProfile
  indexBars: Bar[]
  sectorBars?: Bar[]
  foreignDays?: ForeignDay[]
  foreignStaleness?: { asOf: string; daysOld: number }
  freeFloat?: FreeFloatInput
}

export interface ScanOptions {
  minValue?: number
  minRatio?: number
  /**
   * Skor tren MA minimum untuk lolos gerbang (0..1; 1 = kelima syarat MA).
   * Tanpa nilai = tidak diperiksa. Uji ulang: tren penuh unggul, tren setengah jadi
   * (0,4–0,6) terburuk.
   */
  minTrend?: number
  /** ATR maksimum sebagai persen harga. Tanpa nilai = tidak diperiksa. */
  maxAtrPct?: number
  /** Batas target di atas entry (pecahan), diteruskan ke analyzeRiskReward. */
  targetCap?: number
  /**
   * Kolom peringkat yang DIHARAPKAN ada di run ini. Bawaannya seluruh RANK_COLUMNS.
   *
   * Dipakai pasar yang memang tidak bisa menghasilkan sebagian kolom — crypto
   * tidak punya padanan aliran asing. Tanpa ini, `degraded` menyala di setiap
   * baris crypto dan peringatannya berhenti berarti.
   */
  rankColumns?: readonly RankColumn[]
  /** Format nilai uang untuk string bukti likuiditas. Bawaannya rupiah. */
  money?: (v: number) => string
  /** Nilai transaksi satu bar. Bawaannya `close x volume` (konvensi saham). */
  dailyValue?: (bar: Bar) => number
}

export interface ScanRow {
  code: string
  name: string
  close: number
  date: string
  metrics: {
    volume: Metric<VolumeRead>
    structure: Metric<StructureRead>
    levels: Metric<LevelsRead>
    liquidity: Metric<LiquidityRead>
    vpa: Metric<VpaRead>
    wyckoff: Metric<WyckoffRead>
    flow: Metric<FlowRead>
    strength: Metric<StrengthRead>
    filters: Metric<FiltersRead>
    volatility: Metric<{ atr: number; atrPct: number; suggestedStop: number }>
    riskReward: Metric<RiskRewardRead>
  }
  gates: { passed: boolean; failures: string[] }
  rank: {
    /** null kalau tidak ada satu pun kolom peringkat — bukan nol. */
    score: number | null
    columns: Record<RankColumn, number | null>
    used: RankColumn[]
    /** Ada kolom yang hilang — baris ini tidak sebanding dengan run yang lengkap. */
    degraded: boolean
  }
}

export function buildRow(input: ScanInput, options: ScanOptions = {}): ScanRow {
  const { bars, displayBars, profile } = input
  const last = displayBars[displayBars.length - 1] ?? bars[bars.length - 1]!
  const close = last.close

  const atrSeries = atr(bars, ATR_PERIOD)
  const atrNow = atrSeries[atrSeries.length - 1]
  const atrBefore = atrSeries[atrSeries.length - 1 - 20]
  const atrValue = atrNow ?? close * 0.02

  const volatility: ScanRow['metrics']['volatility'] =
    atrNow == null
      ? unavailable<{ atr: number; atrPct: number; suggestedStop: number }>(`Butuh ${ATR_PERIOD} bar untuk ATR.`)
      : metric(
          { atr: atrNow, atrPct: (atrNow / close) * 100, suggestedStop: 2 * atrNow },
          `ATR ${Math.round(atrNow)} (${((atrNow / close) * 100).toFixed(1)}% dari harga) — stop wajar ${Math.round(2 * atrNow)} per lembar`,
          'tinggi',
          [`Derak harian normal ${Math.round(atrNow)}; stop lebih sempit dari itu akan tersapu tanpa sebab.`],
        )

  const volume = analyzeVolume(displayBars)
  const structure = analyzeStructure(displayBars, toWeekly(displayBars))
  const levels = findLevels(displayBars, profile, atrValue)
  const liquidity = analyzeLiquidity(
    displayBars,
    options.minValue,
    input.freeFloat,
    options.money,
    options.dailyValue,
  )
  const filters = analyzeFilters(bars)
  const strength = analyzeStrength(bars, input.indexBars, input.sectorBars)

  const emptyLevels: LevelsRead = { supports: [], resistances: [] }
  const vpa = analyzeVpa(displayBars, levels.value ?? emptyLevels)
  const wyckoff = analyzeWyckoff(
    structure.value,
    filters.value,
    vpa.value,
    close,
    atrNow != null && atrBefore != null ? atrNow < atrBefore : false,
  )
  const flow = analyzeFlow(input.foreignDays ?? [], input.foreignStaleness)
  const riskReward: Metric<RiskRewardRead> = levels.value
    ? analyzeRiskReward(close, atrValue, levels.value, options.minRatio, options.targetCap)
    : unavailable<RiskRewardRead>('Level belum terbaca, R:R tidak bisa dihitung.')

  // ── Gerbang ────────────────────────────────────────────────────────────────
  const failures: string[] = []
  if (liquidity.value && !liquidity.value.passesGate) failures.push(liquidity.verdict)
  if (!riskReward.available) failures.push(`R:R tidak terukur — ${riskReward.verdict}`)
  else if (riskReward.value && !riskReward.value.passesGate) failures.push(riskReward.verdict)
  if (options.minTrend !== undefined) {
    const t = filters.value?.trendScore
    if (t == null) failures.push(`Tren MA tidak terukur — ${filters.verdict}`)
    else if (t < options.minTrend - 1e-9) {
      failures.push(
        `Tren MA belum penuh: ${Math.round(t * 5)}/5 syarat (close > MA20 > MA50 > MA200, MA50 dan MA200 menanjak).`,
      )
    }
  }
  if (options.maxAtrPct !== undefined) {
    const pct = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',')
    if (!volatility.value) failures.push(`ATR tidak terukur — ${volatility.verdict}`)
    else if (volatility.value.atrPct > options.maxAtrPct) {
      failures.push(`Terlalu volatil: ATR ${volatility.value.atrPct.toFixed(1).replace('.', ',')}% > ${pct(options.maxAtrPct)}%.`)
    }
  }

  // ── Peringkat ──────────────────────────────────────────────────────────────
  const columns: Record<RankColumn, number | null> = {
    trend: filters.value?.trendScore ?? null,
    rs60: strength.value?.rsScore ?? null,
    rvol: volume.value?.confirmationScore ?? null,
    asing: flow.value?.flowScore ?? null,
  }
  // Ambangnya himpunan yang DIHARAPKAN pasar ini, bukan selalu keempatnya.
  const expected = options.rankColumns ?? RANK_COLUMNS
  const used = expected.filter((c) => columns[c] !== null)
  const score = used.length > 0 ? used.reduce((a, c) => a + columns[c]!, 0) / used.length : null

  return {
    code: input.code,
    name: input.name,
    close,
    date: last.date,
    metrics: { volume, structure, levels, liquidity, vpa, wyckoff, flow, strength, filters, volatility, riskReward },
    gates: { passed: failures.length === 0, failures },
    rank: { score, columns, used: [...used], degraded: used.length < expected.length },
  }
}

/**
 * Tanggal data run: bar TERBARU di antara semua baris.
 *
 * Bukan tanggal baris pertama — kalau emiten pertama watchlist disuspensi, run
 * hari ini akan dinamai tanggal lamanya dan menimpa catatan hari itu.
 */
export function tanggalRun(rows: ScanRow[]): string | null {
  return rows.reduce<string | null>((max, r) => (max === null || r.date > max ? r.date : max), null)
}

/**
 * Baris yang bar terakhirnya lebih tua dari tanggal run gagal gerbang.
 *
 * Bar lama berarti emiten tidak diperdagangkan (suspensi, atau Yahoo tertinggal);
 * entry, stop, dan targetnya disusun dari harga yang sudah tidak berlaku.
 */
export function tandaiTertinggal(rows: ScanRow[], tanggal: string): ScanRow[] {
  return rows.map((r) => {
    if (r.date >= tanggal) return r
    const failures = [...r.gates.failures, `Data tertinggal: bar terakhir ${r.date}, run ${tanggal}.`]
    return { ...r, gates: { passed: false, failures } }
  })
}
