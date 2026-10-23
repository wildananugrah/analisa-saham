import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gateOptions, parseScanArgs, parseWatchlist, type ScanArgs } from './cli-args.ts'
import { fetchBars } from './yahoo.ts'
import type { Bar } from './types.ts'
import { volumeProfile } from './indicators.ts'
import { WARMUP_BARS } from './chart.ts'
import { buildRow, tandaiTertinggal, tanggalRun, type ScanRow } from './analysis/report.ts'
import { fetchEnrichment, type Enrichment } from './idx.ts'
import { renderTable } from './output/table.ts'
import { toCsv } from './output/csv.ts'
import { writeXlsx } from './output/xlsx.ts'
import { toJson } from './output/json.ts'
import { isIntraday, writeScreener } from './output/screener.ts'
import { bolehCatat, MAKS_GAGAL, pilihanFromRows } from './hasil/nilai.ts'
import { barTertutup, historyRange, MARKET_IDS } from './market.ts'

const RAW_DIR = 'raw'
const PROFILE_ROWS = 24

const USAGE = `Pakai: bun run src/scan.ts [KODE...] [opsi]

  KODE...                  Kode emiten. Kosong = baca watchlist.
  --days N                 Panjang jendela analisis (bawaan 250).
  --min-likuiditas MILIAR  Ambang nilai transaksi harian (bawaan 5).
  --min-rr N               Ambang risk/reward (bawaan: bukan syarat gerbang).
  --min-tren N             Skor tren MA minimum 0..1 (bawaan 1 = kelima syarat MA; 0 = mati).
  --maks-atr PERSEN        ATR maksimum (bawaan 5,1 IDX / 7,6 crypto).
  --target-maks PERSEN     Batas target di atas entry (bawaan 10; 0 = tanpa batas).
  --hari-idx N             Hari bursa riwayat IDX: aliran asing dan RS sektor (bawaan 65).
  --tanpa-idx              Lewati lapisan IDX; jalankan 9 metrik Yahoo saja.
  --out DIR                Direktori keluaran JSON per emiten (bawaan out).
  --report-dir DIR         Direktori laporan CSV/Excel (bawaan report).
  --market PASAR           Pasar yang dipindai: ${MARKET_IDS.join(' atau ')} (bawaan idx).
                           Pasar menentukan bawaan watchlist, direktori, patokan,
                           dan satuan --min-likuiditas.
  --watchlist BERKAS       Daftar kode (bawaan watchlist.txt).
  --tanpa-html             Jangan tulis halaman screener HTML.
  --draft | --final        Paksa tanda DRAFT intraday di halaman HTML. Tanpa
                           keduanya, IDX ditandai draft otomatis kalau bar
                           terakhir bertanggal hari ini sebelum 16:15 WIB.`

async function resolveCodes(args: ScanArgs): Promise<string[] | null> {
  if (args.codes.length > 0) return args.codes
  try {
    const codes = parseWatchlist(await readFile(args.watchlist, 'utf8'))
    if (codes.length === 0) {
      console.error(`${args.watchlist} tidak berisi satu kode emiten pun.`)
      return null
    }
    return codes
  } catch {
    console.error(`Tidak bisa membaca ${args.watchlist}. Sebutkan kodenya langsung, mis. bun run src/scan.ts BBCA`)
    return null
  }
}

async function main(): Promise<number> {
  let args: ScanArgs
  try {
    args = parseScanArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`)
    return 1
  }

  const codes = await resolveCodes(args)
  if (!codes) return 1

  await mkdir(args.outDir, { recursive: true })
  await mkdir(args.reportDir, { recursive: true })
  const market = args.market
  const range = historyRange(args.days, WARMUP_BARS, market)

  // IHSG dulu: tanpa ini metrik kekuatan relatif tidak bisa dihitung untuk siapa pun.
  let indexBars: Bar[]
  const alasanDegradasi: string[] = []
  try {
    indexBars = barTertutup((await fetchBars(market.benchmark, { range, rawDir: RAW_DIR, market })).bars, market)
  } catch (err) {
    console.error(
      `Gagal mengambil patokan (${market.benchmark}): ${err instanceof Error ? err.message : String(err)}`,
    )
    console.error('Kekuatan relatif tidak bisa dihitung; scan dilanjutkan tanpa metrik itu.')
    alasanDegradasi.push(`Patokan ${market.benchmark} gagal diambil, jadi RS60 bernilai n/a.`)
    indexBars = []
  }

  // Lapisan pengaya IDX. Kegagalannya TIDAK menggagalkan scan.
  const enrichment: Enrichment = args.useIdx
    ? await fetchEnrichment(codes, args.idxDays)
    : {
        foreignByCode: new Map(),
        freeFloatByCode: new Map(),
        sectorBarsByCode: new Map(),
        note: market.hasIdxLayer
          ? 'Lapisan IDX dimatikan lewat --tanpa-idx.'
          : `Lapisan IDX tidak berlaku di pasar ${market.id}; 3 metrik khas IDX dilewati.`,
      }
  if (enrichment.note) console.error(`[idx] ${enrichment.note}`)
  if (enrichment.note && market.hasIdxLayer) alasanDegradasi.push(enrichment.note)

  let rows: ScanRow[] = []
  const barsByCode = new Map<string, Bar[]>()
  let failed = 0

  for (const code of codes) {
    try {
      const fetched = await fetchBars(code, { range, rawDir: RAW_DIR, market })
      const data = { ...fetched, bars: barTertutup(fetched.bars, market) }
      const displayBars = data.bars.slice(-args.days)
      const row = buildRow(
        {
          code,
          name: data.name,
          bars: data.bars,
          displayBars,
          profile: volumeProfile(displayBars, PROFILE_ROWS),
          indexBars,
          sectorBars: enrichment.sectorBarsByCode.get(code),
          foreignDays: enrichment.foreignByCode.get(code),
          foreignStaleness: enrichment.staleness,
          freeFloat: enrichment.freeFloatByCode.get(code),
        },
        {
          minValue: args.minValue,
          ...gateOptions(args),
          rankColumns: market.rankColumns,
          money: market.money,
          dailyValue: market.dailyValue,
        },
      )
      rows.push(row)
      if (args.html) barsByCode.set(code, data.bars)
    } catch (err) {
      failed++
      console.error(`${code.padEnd(6)} GAGAL: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const tanggal = tanggalRun(rows) ?? new Date().toISOString().slice(0, 10)
  rows = tandaiTertinggal(rows, tanggal)
  for (const row of rows) await writeFile(join(args.outDir, `${row.code}.json`), toJson(row))

  const passed = rows.filter((r) => r.gates.passed).sort((a, b) => (b.rank.score ?? -1) - (a.rank.score ?? -1))
  const skipped = rows.filter((r) => !r.gates.passed)

  console.log('')
  console.log(renderTable(passed, skipped, market))

  const csvPath = join(args.reportDir, `scan-${tanggal}.csv`)
  const xlsxPath = join(args.reportDir, `scan-${tanggal}.xlsx`)
  await writeFile(csvPath, toCsv([...passed, ...skipped], market))
  await writeXlsx(passed, skipped, xlsxPath, market)

  const draft = args.draft ?? isIntraday(tanggal, market)

  // Catatan pilihan untuk src/hasil.ts — lihat bolehCatat untuk syaratnya.
  let pilihanPath: string | null = null
  const run = { watchlist: args.codes.length === 0, draft, total: codes.length, failed }
  if (bolehCatat(run)) {
    pilihanPath = join(args.reportDir, `pilihan-${tanggal}.json`)
    await writeFile(pilihanPath, JSON.stringify(pilihanFromRows(passed), null, 1))
  } else if (run.watchlist && !draft) {
    console.error(
      `Pilihan TIDAK dicatat: ${failed} dari ${codes.length} emiten gagal diambil (batas ${MAKS_GAGAL * 100}%). Catatan lama dipertahankan.`,
    )
  }

  let htmlPath: string | null = null
  if (args.html) {
    htmlPath = await writeScreener(join(args.reportDir, `screener-${tanggal}`), [...passed, ...skipped], barsByCode, market, {
      draft,
      minValue: args.minValue,
      ...gateOptions(args),
      alasanDegradasi: alasanDegradasi.join(' ') || undefined,
    })
  }

  console.log('')
  console.log(`CSV  : ${csvPath}`)
  console.log(`Excel: ${xlsxPath}`)
  if (pilihanPath) console.log(`Pilihan: ${pilihanPath}`)
  if (htmlPath) console.log(`HTML : ${htmlPath}${draft ? '  (DRAFT — bar hari ini belum final)' : ''}`)
  console.log(`JSON : ${args.outDir}/<KODE>.json`)

  if (failed > 0) console.error(`\n${failed} dari ${codes.length} emiten gagal diambil.`)
  return failed > 0 ? 1 : 0
}

process.exit(await main())
