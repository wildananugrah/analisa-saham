import type { RankColumn } from './analysis/report.ts'
import type { Bar } from './types.ts'

/**
 * Yang membedakan satu pasar dari pasar lain — tidak lebih.
 *
 * Lapisan analisisnya sudah netral pasar: semua modul di `analysis/` hanya
 * menerima `Bar[]`. Yang benar-benar berbeda antara IDX dan crypto ternyata
 * cuma segelintir parameter, dan di sinilah tempatnya. Menambah pasar ketiga
 * berarti menambah satu nilai di bawah, bukan satu cabang di sepanjang kode.
 */
export interface Market {
  id: MarketId
  /**
   * Kode watchlist → simbol Yahoo.
   *
   * Dipakai sebelum permintaan jaringan, jadi salah di sini berarti 404 —
   * bukan angka yang salah, yang jauh lebih sulit terlihat.
   */
  toSymbol(code: string): string
  /** Patokan kekuatan relatif. */
  benchmark: string
  /**
   * Bar per tahun untuk menghitung `range` Yahoo.
   *
   * IDX 250 hari bursa; crypto 365 hari kalender karena tidak pernah tutup.
   * Memakai 250 untuk crypto membuat riwayat yang diambil kurang ~30%.
   */
  barsPerYear: number
  watchlist: string
  outDir: string
  reportDir: string
  /**
   * Nilai transaksi satu bar, dalam mata uang kuotasi.
   *
   * Konvensi medan `volume` Yahoo BERBEDA antar pasar, dan ini bukan detail kecil:
   * untuk saham volume adalah jumlah LEMBAR, jadi nilainya `close x volume`.
   * Untuk crypto, volumenya SUDAH dalam USD — mengalikannya dengan harga
   * menggelembungkan hasilnya sebesar harga itu sendiri, dan gerbang likuiditas
   * berubah jadi gerbang yang meloloskan apa saja.
   */
  dailyValue(bar: Bar): number
  /** Ambang likuiditas dalam mata uang kuotasi pasar ini. */
  minValue: number
  /**
   * Pengali untuk masukan `--min-likuiditas`.
   *
   * IDX dimasukkan dalam miliar rupiah, crypto dalam juta dolar — satuan yang
   * wajar diucapkan di masing-masing pasar. Tanpa ini, `--min-likuiditas 5` di
   * crypto berarti $5 miliar: salah 1000x, dan salah ke arah yang diam-diam
   * meloloskan semuanya.
   */
  minValueScale: number
  /** Nama satuan masukan itu, untuk teks bantuan. */
  minValueUnit: string
  /**
   * ATR maksimum (persen harga) untuk lolos gerbang.
   *
   * Nilainya median ATR sampel likuid di uji ulang 2 tahun (src/replay.ts):
   * volatilitas tinggi adalah pembeda terkuat ke arah buruk di kedua pasar, dan
   * tren penuh + ATR ≤ median unggul di kedua paruh waktunya.
   */
  maxAtrPct: number
  /** Format nilai uang untuk string bukti (prosa). */
  money(v: number): string
  /**
   * Format ringkas untuk kolom tabel terminal yang lebarnya tetap.
   *
   * Dipisah dari `money` karena keduanya melayani permukaan berbeda: prosa bukti
   * boleh lega, sel tabel tidak. Nilai IDX-nya sengaja sama persis dengan format
   * tabel yang sudah ada supaya keluaran IDX tidak bergeser.
   */
  moneyCompact(v: number): string
  /** Kode mata uang untuk header kolom, mis. `NILAI_HARIAN_USD`. */
  currencyCode: string
  /** Label bursa di judul grafik. */
  exchangeLabel: string
  /** Satuan volume di panel volume grafik. */
  volumeUnit: string
  /**
   * Volume mentah → volume yang ditampilkan.
   *
   * IDX diperdagangkan per LOT (1 lot = 100 lembar), jadi angkanya dibagi 100.
   * Volume crypto sudah dalam USD — membaginya 100 lalu menyebutnya "lot" salah
   * dua kali sekaligus.
   */
  toDisplayVolume(volume: number): number
  /**
   * Lebar kolom KODE di tabel terminal.
   *
   * Kode IDX empat huruf; pasangan crypto bisa sepuluh (`RENDER-USD`). Memotongnya
   * membuat keluaran ambigu — dan ambigu soal instrumen apa yang sedang dibaca.
   */
  codeWidth: number
  /** Lapisan pengaya IDX berlaku di pasar ini. */
  hasIdxLayer: boolean
  /**
   * Kolom peringkat yang memang bisa dihasilkan pasar ini.
   *
   * Bukan hiasan: `degraded` dihitung terhadap himpunan INI, bukan terhadap
   * seluruh RANK_COLUMNS. Tanpa itu, setiap baris crypto akan ditandai
   * terdegradasi selamanya — karena `asing` tidak punya padanan di crypto —
   * dan peringatan yang benar berubah jadi derau yang diabaikan.
   */
  rankColumns: readonly RankColumn[]
}

export type MarketId = 'idx' | 'crypto'

/** Satu lot IDX = 100 lembar. Konvensi perdagangan, bukan detail API Yahoo. */
export const SHARES_PER_LOT = 100

/** `Rp 5.00 M` — M berarti miliar, satuan yang dipakai saat bicara likuiditas IDX. */
const rupiah = (v: number): string => `Rp ${(v / 1e9).toFixed(2)} M`

/**
 * `$30.00B` / `$15.00M` — skalanya ikut besarannya.
 *
 * Sengaja tidak memakai satu satuan tetap: volume harian crypto merentang dari
 * juta sampai puluhan miliar dolar, dan `$30000.00M` tidak terbaca. Memakai B
 * untuk miliar juga menghindari tabrakan arti dengan M-nya rupiah di atas.
 */
const dollar = (v: number): string => {
  const abs = Math.abs(v)
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  return `$${v.toFixed(0)}`
}

/** Sama persis dengan format lama di `output/table.ts`. */
const rupiahCompact = (v: number): string => `Rp${(v / 1e9).toFixed(1)}M`

const dollarCompact = (v: number): string => {
  const abs = Math.abs(v)
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  return `$${v.toFixed(0)}`
}

export const IDX: Market = Object.freeze({
  id: 'idx',
  toSymbol(code: string): string {
    const upper = code.trim().toUpperCase()
    // Simbol indeks berawalan ^ (mis. ^JKSE) TIDAK diberi sufiks — `^JKSE.JK`
    // tidak ada, dan menambahkannya membuat IHSG selalu balik 404.
    if (upper.startsWith('^')) return upper
    return upper.includes('.') ? upper : `${upper}.JK`
  },
  benchmark: '^JKSE',
  barsPerYear: 250,
  watchlist: 'watchlist.txt',
  outDir: 'out',
  reportDir: 'report',
  dailyValue: (bar: Bar) => bar.close * bar.volume,
  minValue: 5e9,
  minValueScale: 1e9,
  minValueUnit: 'MILIAR',
  maxAtrPct: 5.1,
  money: rupiah,
  moneyCompact: rupiahCompact,
  currencyCode: 'RP',
  exchangeLabel: 'IDX',
  volumeUnit: 'lot',
  // Persis ekspresi lama `volume / SHARES_PER_LOT` — TANPA pembulatan, supaya
  // keluaran grafik IDX tidak bergeser sepersekian piksel pun.
  toDisplayVolume: (v: number) => v / SHARES_PER_LOT,
  codeWidth: 6,
  hasIdxLayer: true,
  rankColumns: ['trend', 'rs60', 'rvol', 'asing'] as const,
})

export const CRYPTO: Market = Object.freeze({
  id: 'crypto',
  toSymbol(code: string): string {
    // Pasangan crypto sudah membawa kuotasinya sendiri (`BTC-USD`), jadi tidak
    // ada sufiks yang perlu ditambahkan — cukup dinormalkan huruf besar.
    return code.trim().toUpperCase()
  },
  benchmark: 'BTC-USD',
  barsPerYear: 365,
  watchlist: 'crypto-watchlist.txt',
  // Direktori sendiri BUKAN kenyamanan: laporan dinamai `scan-<tanggal>.csv` di
  // kedua pasar, jadi tanpa pemisahan ini run crypto menimpa laporan IDX hari itu.
  outDir: 'out/crypto',
  reportDir: 'report/crypto',
  dailyValue: (bar: Bar) => bar.volume,
  minValue: 10e6,
  minValueScale: 1e6,
  minValueUnit: 'JUTA',
  maxAtrPct: 7.6,
  money: dollar,
  moneyCompact: dollarCompact,
  currencyCode: 'USD',
  exchangeLabel: 'CRYPTO',
  volumeUnit: 'USD',
  toDisplayVolume: (v: number) => v,
  codeWidth: 10,
  hasIdxLayer: false,
  rankColumns: ['trend', 'rs60', 'rvol'] as const,
})

const MARKETS: Record<MarketId, Market> = { idx: IDX, crypto: CRYPTO }

export const MARKET_IDS = Object.keys(MARKETS) as MarketId[]

export function marketById(id: string): Market {
  const market = MARKETS[id as MarketId]
  if (!market) {
    throw new Error(`Pasar tidak dikenal: ${id}. Pilihannya: ${MARKET_IDS.join(', ')}.`)
  }
  return market
}

/**
 * Buang candle harian yang belum tutup.
 *
 * Crypto: candle harian Yahoo bertanggal hari UTC dan baru tutup 00:00 UTC
 * berikutnya. Scan pukul 07:15 WIB (00:15 UTC) sudah melihat candle hari baru
 * yang baru berumur 15 menit — volume, RVOL, dan close-nya belum berarti apa-apa.
 *
 * IDX tidak disentuh: bar intraday IDX ditandai DRAFT, bukan dibuang.
 */
export function barTertutup(bars: Bar[], market: Market, now: Date = new Date()): Bar[] {
  if (market.id !== 'crypto') return bars
  const hariIni = now.toISOString().slice(0, 10)
  return bars.at(-1)?.date === hariIni ? bars.slice(0, -1) : bars
}

/**
 * Rentang riwayat Yahoo yang cukup untuk jendela tampil plus pemanasan MA.
 *
 * Ditambah satu tahun sebagai bantalan: `range` Yahoo dihitung dari kalender,
 * sementara yang dibutuhkan dihitung dari bar, dan libur bursa membuat keduanya
 * tidak pernah pas.
 */
export function historyRange(displayDays: number, warmupBars: number, market: Market): string {
  return `${Math.ceil((displayDays + warmupBars) / market.barsPerYear) + 1}y`
}
