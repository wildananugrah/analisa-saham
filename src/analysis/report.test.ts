import { expect, test, describe } from 'bun:test'
import { buildRow, RANK_COLUMNS, tanggalRun, tandaiTertinggal } from './report.ts'
import { SCAN_DEFAULTS } from '../cli-args.ts'
import { volumeProfile } from '../indicators.ts'
import type { Bar } from '../types.ts'
import type { ForeignDay } from './flow.ts'

/** Uptrend bergelombang yang cukup panjang untuk MA 200 dan RS 60 hari. */
function healthy(count = 320, start = 1000, endPrice = 3000, volume = 20_000_000): Bar[] {
  return Array.from({ length: count }, (_, i) => {
    const trend = start + ((endPrice - start) * i) / (count - 1)
    const wave = Math.sin(i / 7) * trend * 0.04
    const price = trend + wave
    return {
      date: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10),
      open: price - wave * 0.1,
      high: price * 1.015,
      low: price * 0.985,
      close: price,
      volume,
    }
  })
}

function flat(count = 320, price = 1000, volume = 20_000_000): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    open: price,
    high: price * 1.01,
    low: price * 0.99,
    close: price,
    volume,
  }))
}

function input(over: Partial<Parameters<typeof buildRow>[0]> = {}) {
  const bars = healthy()
  const displayBars = bars.slice(-250)
  return {
    code: 'UJI',
    name: 'Uji Tbk.',
    bars,
    displayBars,
    profile: volumeProfile(displayBars, 24),
    indexBars: flat(320),
    ...over,
  }
}

const foreign = (net: number): ForeignDay[] =>
  Array.from({ length: 60 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    netShares: net,
    close: 2000,
  }))

describe('buildRow — gerbang', () => {
  test('likuiditas di bawah ambang menggagalkan gerbang berikut alasannya', () => {
    const bars = healthy(320, 1000, 3000, 100) // nilai harian jauh di bawah Rp 5 M
    const row = buildRow(input({ bars, displayBars: bars.slice(-250) }))
    expect(row.gates.passed).toBe(false)
    expect(row.gates.failures.join(' ').toLowerCase()).toContain('likuid')
  })

  test('alasan gagal menyebut angkanya, bukan cuma label gagal', () => {
    const bars = healthy(320, 1000, 3000, 100)
    const row = buildRow(input({ bars, displayBars: bars.slice(-250) }))
    expect(row.gates.failures.join(' ')).toMatch(/Rp/)
  })

  test('emiten sehat dan likuid melewati gerbang likuiditas', () => {
    const row = buildRow(input())
    expect(row.gates.failures.join(' ').toLowerCase()).not.toContain('tidak likuid')
  })

  test('minTrend 1: tren MA yang belum penuh menggagalkan gerbang, dengan jumlah syaratnya', () => {
    const bars = flat()
    const row = buildRow(input({ bars, displayBars: bars.slice(-250) }), { minTrend: 1 })
    expect(row.gates.passed).toBe(false)
    expect(row.gates.failures.join(' ')).toMatch(/Tren MA belum penuh: \d\/5/)
  })

  test('minTrend 1: uptrend dengan kelima syarat MA lolos syarat tren', () => {
    const row = buildRow(input(), { minTrend: 1 })
    expect(row.metrics.filters.value!.trendScore).toBe(1)
    expect(row.gates.failures.join(' ')).not.toContain('Tren MA')
  })

  test('maxAtrPct: emiten lebih volatil dari ambang gagal, dengan ATR-nya', () => {
    const row = buildRow(input(), { maxAtrPct: 0.5 })
    expect(row.gates.passed).toBe(false)
    expect(row.gates.failures.join(' ')).toMatch(/Terlalu volatil: ATR \d+,\d% > 0,5%/)
  })

  test('tanpa minTrend dan maxAtrPct, kedua syarat itu tidak diperiksa', () => {
    const bars = flat()
    const row = buildRow(input({ bars, displayBars: bars.slice(-250) }))
    expect(row.gates.failures.join(' ')).not.toMatch(/Tren MA|volatil/)
  })

  test('targetCap diteruskan ke rencana: target tidak lebih jauh dari entry + batas', () => {
    // Uptrend lalu turun ~12% dalam 25 bar terakhir, supaya ada resistance di atas harga.
    const bars = healthy().map((b, i, all) => {
      const k = Math.max(0, i - (all.length - 25)) / 25
      const f = 1 - 0.12 * k
      return { ...b, open: b.open * f, high: b.high * f, low: b.low * f, close: b.close * f }
    })
    const uncapped = buildRow(input({ bars, displayBars: bars.slice(-250) })).metrics.riskReward.value!
    expect(uncapped.target).toBeGreaterThan(uncapped.entry * 1.01)
    const rr = buildRow(input({ bars, displayBars: bars.slice(-250) }), { targetCap: 0.01 }).metrics.riskReward.value!
    expect(rr.target).toBeCloseTo(rr.entry * 1.01, 6)
  })
})

describe('buildRow — peringkat', () => {
  test('memakai empat kolom saat semua data tersedia', () => {
    const row = buildRow(input({ foreignDays: foreign(1_000_000) }))
    expect(row.rank.used).toHaveLength(4)
    expect(row.rank.used).toEqual([...RANK_COLUMNS])
    expect(row.rank.degraded).toBe(false)
  })

  test('tanpa data asing, kolomnya dicoret dan ditandai terdegradasi', () => {
    const row = buildRow(input())
    expect(row.rank.used).not.toContain('asing')
    expect(row.rank.used).toHaveLength(3)
    expect(row.rank.degraded).toBe(true)
  })

  test('skor adalah rata-rata kolom yang DIPAKAI, bukan dibagi empat diam-diam', () => {
    const row = buildRow(input())
    const dipakai = row.rank.used.map((k) => row.rank.columns[k]!)
    const rataRata = dipakai.reduce((a, b) => a + b, 0) / dipakai.length
    expect(row.rank.score).toBeCloseTo(rataRata, 9)
  })

  test('skor selalu di 0..1', () => {
    for (const row of [buildRow(input()), buildRow(input({ foreignDays: foreign(-9e6) }))]) {
      expect(row.rank.score).toBeGreaterThanOrEqual(0)
      expect(row.rank.score).toBeLessThanOrEqual(1)
    }
  })

  test('Wyckoff dan VPA TIDAK PERNAH masuk kolom peringkat', () => {
    const row = buildRow(input({ foreignDays: foreign(1_000_000) }))
    const keys = Object.keys(row.rank.columns)
    expect(keys).not.toContain('wyckoff')
    expect(keys).not.toContain('vpa')
    expect(RANK_COLUMNS).not.toContain('wyckoff' as never)
  })

  test('akumulasi asing memberi skor lebih tinggi dari distribusi asing', () => {
    const beli = buildRow(input({ foreignDays: foreign(1_000_000) })).rank.score
    const jual = buildRow(input({ foreignDays: foreign(-1_000_000) })).rank.score
    expect(beli!).toBeGreaterThan(jual!)
  })
})

describe('buildRow — kelengkapan', () => {
  test('mengembalikan kedua belas metrik, termasuk yang tidak tersedia', () => {
    const row = buildRow(input())
    for (const key of ['volume', 'structure', 'levels', 'liquidity', 'vpa', 'wyckoff', 'flow', 'strength', 'filters', 'volatility', 'riskReward'] as const) {
      expect(row.metrics[key]).toBeDefined()
    }
  })

  test('metrik yang butuh IDX ditandai available false, bukan nol', () => {
    const row = buildRow(input())
    expect(row.metrics.flow.available).toBe(false)
    expect(row.metrics.flow.value).toBeNull()
  })

  test('umur data cache diteruskan ke metrik aliran asing', () => {
    const row = buildRow(
      input({ foreignDays: foreign(1_000_000), foreignStaleness: { asOf: '2026-09-12', daysOld: 4 } }),
    )
    expect(row.metrics.flow.staleness?.daysOld).toBe(4)
  })

  test('membawa kode, nama, close, dan tanggal bar terakhir', () => {
    const row = buildRow(input())
    expect(row.code).toBe('UJI')
    expect(row.name).toBe('Uji Tbk.')
    expect(row.date).toBe('2025-11-16')
    expect(row.close).toBeGreaterThan(0)
  })
})

describe('buildRow — kolom peringkat per pasar', () => {
  // Pasar crypto tidak punya padanan aliran asing. Tanpa himpunan kolom yang
  // diharapkan, SETIAP baris crypto akan ditandai terdegradasi selamanya dan
  // spanduk PERINGATAN di Excel berubah jadi derau yang diabaikan.
  const CRYPTO_COLUMNS = ['trend', 'rs60', 'rvol'] as const

  test('tanpa opsi, ambangnya tetap seluruh RANK_COLUMNS', () => {
    const row = buildRow(input())
    expect(row.rank.degraded).toBe(true) // asing kosong, 3 dari 4
  })

  test('run crypto lengkap TIDAK terdegradasi meski asing kosong', () => {
    const row = buildRow(input(), { rankColumns: CRYPTO_COLUMNS })
    expect(row.rank.used).toEqual(['trend', 'rs60', 'rvol'])
    expect(row.rank.degraded).toBe(false)
  })

  test('kolom di luar himpunan pasar tidak ikut dipakai walau datanya ada', () => {
    const row = buildRow(input({ foreignDays: foreign(1_000_000) }), { rankColumns: CRYPTO_COLUMNS })
    expect(row.rank.used).not.toContain('asing')
    expect(row.rank.used).toHaveLength(3)
  })

  test('skor crypto dirata-ratakan hanya dari kolom yang diharapkan', () => {
    // Diturunkan dari kolom yang DISEBUT, bukan dari rank.used — kalau dari
    // rank.used, pernyataannya selalu benar dengan sendirinya dan tidak menguji apa pun.
    const row = buildRow(input({ foreignDays: foreign(1_000_000) }), { rankColumns: CRYPTO_COLUMNS })
    const c = row.rank.columns
    expect(row.rank.score).toBeCloseTo((c.trend! + c.rs60! + c.rvol!) / 3, 9)

    // Dan skornya memang berbeda dari IDX, yang ikut menghitung asing.
    //
    // Pakai asing JUAL: dengan asing beli, keempat kolom mentok 1,0 sehingga
    // rata-rata 3 kolom sama dengan rata-rata 4 kolom dan bedanya tak terlihat.
    const jual = { foreignDays: foreign(-1_000_000) }
    const cryptoJual = buildRow(input(jual), { rankColumns: CRYPTO_COLUMNS })
    const idxJual = buildRow(input(jual))
    expect(idxJual.rank.used).toContain('asing')
    expect(idxJual.rank.score).not.toBeCloseTo(cryptoJual.rank.score!, 9)
  })

  test('kolom yang benar-benar hilang tetap menandai terdegradasi', () => {
    // Tanpa bar patokan, rs60 tidak bisa dihitung: 2 dari 3 yang diharapkan.
    const row = buildRow(input({ indexBars: [] }), { rankColumns: CRYPTO_COLUMNS })
    expect(row.rank.used).not.toContain('rs60')
    expect(row.rank.degraded).toBe(true)
  })
})

describe('buildRow — mata uang diteruskan', () => {
  test('formatter pasar dipakai di bukti likuiditas', () => {
    const row = buildRow(input(), { money: (v) => `$${(v / 1e6).toFixed(1)}M` })
    expect(row.metrics.liquidity.verdict).toContain('$')
    expect(row.metrics.liquidity.verdict).not.toContain('Rp')
  })
})

describe('buildRow — konvensi nilai harian diteruskan', () => {
  test('pasar yang volumenya sudah bernilai uang tidak dikalikan harga lagi', () => {
    const row = buildRow(input(), { dailyValue: (b) => b.volume })
    const bawaan = buildRow(input())
    expect(row.metrics.liquidity.value!.avgDailyValue).toBeLessThan(
      bawaan.metrics.liquidity.value!.avgDailyValue,
    )
    expect(row.metrics.liquidity.value!.avgDailyValue).toBeCloseTo(20_000_000, -3)
  })
})

describe('buildRow — skor tanpa kolom', () => {
  test('tidak ada satu pun kolom peringkat → skor null, bukan nol', () => {
    const row = buildRow(input({ indexBars: [] }), { rankColumns: ['rs60'] })
    expect(row.rank.used).toEqual([])
    expect(row.rank.score).toBeNull()
  })
})

describe('buildRow — RS sektor dengan riwayat IDX bawaan', () => {
  test('bar sektor sepanjang --hari-idx bawaan cukup untuk RS sektor 60 hari', () => {
    const sectorBars = healthy().slice(-SCAN_DEFAULTS.idxDays)
    const row = buildRow(input({ sectorBars }))
    expect(row.metrics.strength.value!.vsSector60).not.toBeNull()
  })
})

describe('tanggalRun dan tandaiTertinggal', () => {
  const dated = (date: string) => ({ ...buildRow(input()), date })

  test('tanggal run adalah bar terbaru di antara semua baris, bukan baris pertama', () => {
    expect(tanggalRun([dated('2026-10-01'), dated('2026-10-22'), dated('2026-10-21')])).toBe('2026-10-22')
  })

  test('tanpa baris, tanggal run null', () => {
    expect(tanggalRun([])).toBeNull()
  })

  test('baris yang bar terakhirnya tertinggal gagal gerbang, dengan kedua tanggalnya', () => {
    const [r] = tandaiTertinggal([dated('2026-10-01')], '2026-10-22')
    expect(r!.gates.passed).toBe(false)
    expect(r!.gates.failures.join(' ')).toContain('2026-10-01')
    expect(r!.gates.failures.join(' ')).toContain('2026-10-22')
  })

  test('baris bertanggal run tidak berubah', () => {
    const fresh = dated('2026-10-22')
    expect(tandaiTertinggal([fresh], '2026-10-22')[0]).toEqual(fresh)
  })
})
