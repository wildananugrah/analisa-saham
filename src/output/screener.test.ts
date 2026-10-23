import { expect, test, describe } from 'bun:test'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildScreener, CHART_BARS, CHUNK, isIntraday, loadTemplate, sma, writeScreener } from './screener.ts'
import { CRYPTO, IDX } from '../market.ts'
import type { ScanRow } from '../analysis/report.ts'
import type { Bar } from '../types.ts'

function row(code: string, over: Partial<ScanRow> = {}): ScanRow {
  const m = (value: unknown, available = true) => ({
    value, verdict: 'vonis contoh', confidence: 'sedang' as const, evidence: ['bukti satu'], available,
  })
  return {
    code,
    name: `PT ${code} Tbk`,
    close: 1000,
    date: '2026-10-21',
    metrics: {
      volume: m({ rvol: 1.2, classification: 'netral' }),
      structure: m({ daily: { structure: 'uptrend', phase: 'pullback' }, weekly: { structure: 'uptrend' }, aligned: true }),
      levels: m({
        supports: [{ price: 950, score: 0.812, touches: 12 }],
        resistances: [{ price: 1200, score: 0.5, touches: 4 }],
      }),
      liquidity: m({ avgDailyValue: 7.5e9, passesGate: true, freeFloatPct: null }),
      vpa: m({ events: [{ signal: 'spring', date: '2026-10-21', index: 0, rvol: 1, note: 'menembus 950' }], latest: { signal: 'spring', date: '2026-10-21' } }),
      wyckoff: m({ phase: 'akumulasi', reasons: [] }),
      flow: m(null, false),
      strength: m({ rs60: 5, vsSector60: null }),
      filters: m({ stacked: false, obvDivergence: null }),
      volatility: m({ atr: 40, atrPct: 4, suggestedStop: 80 }),
      riskReward: m({ entry: 1000, stop: 930, target: 1200, ratio: 2.86, passesGate: true }),
    },
    gates: { passed: true, failures: [] },
    rank: { score: 0.5, columns: { trend: 0.6, rs60: 0.5, rvol: 0.4, asing: null }, used: ['trend', 'rs60', 'rvol'], degraded: true },
    ...over,
  } as ScanRow
}

function bars(n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
    open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 12_345,
  }))
}

/** Ambil literal JSON yang ditanam setelah `const NAME = `. */
function embedded(html: string, name: string): any {
  const m = html.match(new RegExp(`const ${name} = (.*);\\n`))
  if (!m) throw new Error(`${name} tidak ditemukan`)
  return JSON.parse(m[1]!)
}

const OPTS = { minValue: 5e9, minRatio: 2, now: new Date('2026-10-21T22:00:00Z') }

describe('buildScreener', async () => {
  const template = await loadTemplate()

  test('semua placeholder template terisi', () => {
    const { html } = buildScreener([row('BBCA')], new Map(), template, IDX, OPTS)
    expect(html).not.toContain('/*__')
    expect(html).toContain('<title>Screener Watchlist IDX</title>')
  })

  test('baris tabel berkunci header CSV, nilai harian berkunci netral + teks pasar', () => {
    const { html } = buildScreener([row('BBCA')], new Map(), template, IDX, OPTS)
    const [r] = embedded(html, 'ROWS')
    expect(r.KODE).toBe('BBCA')
    expect(r.RR).toBe(2.86)
    expect(r.GERBANG).toBe('lolos')
    expect(r.NILAI_HARIAN).toBe(7.5e9)
    expect(r.NILAI_HARIAN_TEKS).toBe('Rp7.5M')
    expect(r.NILAI_HARIAN_RP).toBeUndefined()
    // n/a tetap null, bukan nol.
    expect(r.ASING_SKOR).toBeNull()
  })

  test('teks gerbang di meta menyebut syarat yang benar-benar dipakai run ini', () => {
    const meta = embedded(buildScreener([row('BBCA')], new Map(), template, IDX, {
      ...OPTS, minRatio: 0, minTrend: 1, maxAtrPct: 5.1, targetCap: 0.1,
    }).html, 'META')
    expect(meta.gerbang).toBe('likuiditas ≥ Rp5.0M per hari, tren MA penuh (5/5), ATR ≤ 5,1%, target maks +10%')
    const lama = embedded(buildScreener([row('BBCA')], new Map(), template, IDX, OPTS).html, 'META')
    expect(lama.gerbang).toBe('likuiditas ≥ Rp5.0M per hari, R:R ≥ 1:2')
  })

  test('meta membawa ambang run dan status terdegradasi', () => {
    const { html } = buildScreener([row('BBCA')], new Map(), template, IDX, { ...OPTS, minRatio: 1.5 })
    const meta = embedded(html, 'META')
    expect(meta.tanggal).toBe('2026-10-21')
    expect(meta.degraded).toBe(true)
    expect(meta.minValue).toBe('Rp5.0M')
    expect(meta.minRatioText).toBe('1,5')
    expect(meta.volumeUnit).toBe('lot')
    expect(meta.dibuat).toBe('2026-10-22 05:00 WIB')
  })

  test('emiten dipecah per CHUNK, peta chunk ikut di meta', () => {
    const rows = Array.from({ length: CHUNK + 5 }, (_, i) => row(`K${i}`))
    const { html, files } = buildScreener(rows, new Map(), template, IDX, OPTS)
    expect([...files.keys()].sort()).toEqual(['data/bars-0.json', 'data/bars-1.json', 'data/detail-0.json', 'data/detail-1.json'])
    const meta = embedded(html, 'META')
    expect(meta.chunk.K0).toBe(0)
    expect(meta.chunk[`K${CHUNK}`]).toBe(1)
    expect(Object.keys(JSON.parse(files.get('data/detail-1.json')!))).toHaveLength(5)
  })

  test('detail membawa level, VPA, dan bukti tiap metrik', () => {
    const { files } = buildScreener([row('BBCA')], new Map(), template, IDX, OPTS)
    const d = JSON.parse(files.get('data/detail-0.json')!).BBCA
    expect(d.sup).toEqual([{ p: 950, s: 0.81, t: 12 }])
    expect(d.vpa).toEqual([{ d: '2026-10-21', g: 'spring', n: 'menembus 950' }])
    const flow = d.metrics.find((m: any) => m.key === 'flow')
    expect(flow.ok).toBe(false)
  })

  test('grafik memotong ke CHART_BARS, MA200 dari riwayat penuh, volume dalam lot', () => {
    const { files } = buildScreener([row('BBCA')], new Map([['BBCA', bars(400)]]), template, IDX, OPTS)
    const b = JSON.parse(files.get('data/bars-0.json')!).BBCA
    expect(b.c).toHaveLength(CHART_BARS)
    expect(b.m200[0]).not.toBeNull()
    expect(b.v[0]).toBe(123)
  })

  test('crypto: judul, satuan volume, dan uang ikut pasarnya', () => {
    const r = row('BTC-USD', { metrics: { ...row('X').metrics, liquidity: { ...row('X').metrics.liquidity, value: { avgDailyValue: 2.5e9, passesGate: true, freeFloatPct: null } as any } } })
    const { html, files } = buildScreener([r], new Map([['BTC-USD', bars(10)]]), template, CRYPTO, { ...OPTS, minValue: 10e6 })
    expect(html).toContain('<title>Screener Watchlist CRYPTO</title>')
    expect(embedded(html, 'ROWS')[0].NILAI_HARIAN_TEKS).toBe('$2.5B')
    expect(embedded(html, 'META').volumeUnit).toBe('USD')
    expect(JSON.parse(files.get('data/bars-0.json')!)['BTC-USD'].v[0]).toBe(12_345)
  })

  test('teks berbahaya tidak bisa menutup tag script', () => {
    const { html } = buildScreener([row('BBCA', { name: '</script><b>x' })], new Map(), template, IDX, OPTS)
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(embedded(html, 'ROWS')[0].NAMA).toBe('</script><b>x')
  })

  test('pola pengganti $& di data tidak ditafsir', () => {
    const { html } = buildScreener([row('BBCA', { name: 'A $& B' })], new Map(), template, IDX, OPTS)
    expect(embedded(html, 'ROWS')[0].NAMA).toBe('A $& B')
  })
})

describe('writeScreener', () => {
  test('menulis index.html dan berkas data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'screener-'))
    const index = await writeScreener(dir, [row('BBCA')], new Map([['BBCA', bars(30)]]), IDX, OPTS)
    expect(index).toBe(join(dir, 'index.html'))
    expect(await readFile(index, 'utf8')).toContain('BBCA')
    expect((await readdir(join(dir, 'data'))).sort()).toEqual(['bars-0.json', 'detail-0.json'])
  })
})

describe('sma', () => {
  test('null sampai jendela penuh', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5])
  })
})

describe('isIntraday', () => {
  // 2026-10-21 adalah Rabu.
  test('IDX, bar hari ini sebelum 16:15 WIB → draft', () => {
    expect(isIntraday('2026-10-21', IDX, new Date('2026-10-21T08:00:00Z'))).toBe(true)
  })
  test('setelah 16:15 WIB → final', () => {
    expect(isIntraday('2026-10-21', IDX, new Date('2026-10-21T09:20:00Z'))).toBe(false)
  })
  test('pagi berikutnya, bar kemarin → final', () => {
    expect(isIntraday('2026-10-21', IDX, new Date('2026-10-21T22:00:00Z'))).toBe(false)
  })
  test('crypto tidak pernah tutup → tidak pernah draft', () => {
    expect(isIntraday('2026-10-21', CRYPTO, new Date('2026-10-21T08:00:00Z'))).toBe(false)
  })
})

describe('buildScreener — catatan risiko dan cut loss', async () => {
  const template = await loadTemplate()
  const rr = (ratio: number, stop = 930) =>
    row('BDMN', { metrics: { ...row('X').metrics, riskReward: { ...row('X').metrics.riskReward, value: { entry: 1000, stop, target: 1050, ratio, passesGate: true } } } })
  const rowsOf = (r: ScanRow) => embedded(buildScreener([r], new Map(), template, IDX, OPTS).html, 'ROWS')

  test('R:R di bawah 1 jadi catatan, walau bukan syarat gerbang', () => {
    expect(rowsOf(rr(0.51))[0].CATATAN).toContainEqual(['R:R 1:0,51', 'warn'])
  })

  test('rencana dan sinyal bersih → tanpa catatan', () => {
    expect(rowsOf(row('BBCA'))[0].CATATAN).toEqual([])
  })

  test('catatan lama tetap ada: Wyckoff distribusi', () => {
    const r = row('BBCA', { metrics: { ...row('X').metrics, wyckoff: { ...row('X').metrics.wyckoff, value: { phase: 'distribusi', reasons: [] } } } })
    expect(rowsOf(r)[0].CATATAN).toContainEqual(['Wyckoff distribusi', 'bad'])
  })

  test('cut loss evaluasi ikut aturan /hasil/: stop dijepit ke 5–10% di bawah entry', () => {
    expect(rowsOf(rr(1, 800))[0].CUT_LOSS).toBe(900)
    expect(rowsOf(rr(1, 930))[0].CUT_LOSS).toBe(930)
  })

  test('tanpa rencana, cut loss null', () => {
    const r = row('BBCA', { metrics: { ...row('X').metrics, riskReward: { ...row('X').metrics.riskReward, value: null, available: false } } })
    expect(rowsOf(r)[0].CUT_LOSS).toBeNull()
  })
})

describe('buildScreener — alasan terdegradasi', async () => {
  const template = await loadTemplate()

  test('meta membawa alasan dari lapisan IDX apa adanya', () => {
    const { html } = buildScreener([row('BBCA')], new Map(), template, IDX, { ...OPTS, alasanDegradasi: 'Lapisan IDX dimatikan lewat --tanpa-idx.' })
    expect(embedded(html, 'META').alasanDegradasi).toBe('Lapisan IDX dimatikan lewat --tanpa-idx.')
  })

  test('template tidak lagi menebak bahwa IDX tidak terjangkau', () => {
    expect(template).not.toContain('Data IDX tidak terjangkau')
  })
})
