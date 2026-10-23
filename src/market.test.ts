import { expect, test, describe } from 'bun:test'
import { barTertutup, CRYPTO, IDX, historyRange, marketById } from './market.ts'
import type { Bar } from './types.ts'

describe('IDX', () => {
  test('kode telanjang diberi sufiks .JK', () => {
    expect(IDX.toSymbol('bbca')).toBe('BBCA.JK')
  })

  test('simbol indeks berawalan ^ tidak diberi sufiks', () => {
    expect(IDX.toSymbol('^JKSE')).toBe('^JKSE')
  })

  test('yang sudah bersufiks dibiarkan', () => {
    expect(IDX.toSymbol('BBCA.JK')).toBe('BBCA.JK')
  })

  test('patokan dan bar per tahun sesuai pasar bursa', () => {
    expect(IDX.benchmark).toBe('^JKSE')
    expect(IDX.barsPerYear).toBe(250)
  })

  test('lapisan IDX berlaku, dan asing termasuk kolom peringkat', () => {
    expect(IDX.hasIdxLayer).toBe(true)
    expect(IDX.rankColumns).toContain('asing')
  })

  test('nilai uang diformat rupiah dalam miliar', () => {
    expect(IDX.money(5e9)).toBe('Rp 5.00 M')
  })
})

describe('CRYPTO', () => {
  test('pasangan crypto TIDAK diberi sufiks .JK', () => {
    expect(CRYPTO.toSymbol('BTC-USD')).toBe('BTC-USD')
  })

  test('kode huruf kecil dihuruf-besarkan', () => {
    expect(CRYPTO.toSymbol('btc-usd')).toBe('BTC-USD')
  })

  test('patokan BTC dan tahun kalender 365 hari', () => {
    expect(CRYPTO.benchmark).toBe('BTC-USD')
    expect(CRYPTO.barsPerYear).toBe(365)
  })

  test('lapisan IDX tidak berlaku, asing bukan kolom peringkat', () => {
    expect(CRYPTO.hasIdxLayer).toBe(false)
    expect(CRYPTO.rankColumns).not.toContain('asing')
    expect(CRYPTO.rankColumns).toEqual(['trend', 'rs60', 'rvol'])
  })

  test('nilai uang diformat dolar, skalanya ikut besarannya', () => {
    expect(CRYPTO.money(3e10)).toBe('$30.00B')
    expect(CRYPTO.money(1.5e7)).toBe('$15.00M')
  })
})

describe('direktori keluaran', () => {
  test('crypto menulis ke direktori sendiri supaya laporan tidak bertabrakan', () => {
    // scan-<tanggal>.csv sama namanya di dua pasar; direktori harus beda.
    expect(CRYPTO.reportDir).not.toBe(IDX.reportDir)
    expect(CRYPTO.outDir).not.toBe(IDX.outDir)
    expect(CRYPTO.watchlist).not.toBe(IDX.watchlist)
  })
})

describe('marketById', () => {
  test('id yang dikenal mengembalikan deskriptornya', () => {
    expect(marketById('idx')).toBe(IDX)
    expect(marketById('crypto')).toBe(CRYPTO)
  })

  test('id tak dikenal ditolak dan menyebut nilainya', () => {
    expect(() => marketById('saham')).toThrow(/saham/)
  })
})

describe('historyRange', () => {
  test('IDX tidak berubah dari perilaku sekarang', () => {
    // (250 + 200) / 250 = 1.8 → ceil 2, +1 → 3y
    expect(historyRange(250, 200, IDX)).toBe('3y')
  })

  test('crypto memakai tahun kalender, bukan tahun bursa', () => {
    // (250 + 200) / 365 = 1.23 → ceil 2, +1 → 3y
    expect(historyRange(250, 200, CRYPTO)).toBe('3y')
  })

  test('jendela panjang: pembagi yang berbeda memberi rentang yang berbeda', () => {
    // IDX: 800/250 = 3.2 → 4, +1 = 5y.  Crypto: 800/365 = 2.19 → 3, +1 = 4y.
    expect(historyRange(600, 200, IDX)).toBe('5y')
    expect(historyRange(600, 200, CRYPTO)).toBe('4y')
  })
})

describe('format ringkas untuk tabel terminal', () => {
  test('IDX identik dengan format tabel yang sudah ada', () => {
    // Harus sama persis: mengubahnya menggeser keluaran tabel IDX tanpa alasan.
    expect(IDX.moneyCompact(249.94e9)).toBe('Rp249.9M')
    expect(IDX.moneyCompact(5e9)).toBe('Rp5.0M')
  })

  test('crypto ringkas ikut skalanya', () => {
    expect(CRYPTO.moneyCompact(3e10)).toBe('$30.0B')
    expect(CRYPTO.moneyCompact(1.5e7)).toBe('$15.0M')
  })

  test('kode mata uang dipakai untuk header kolom', () => {
    expect(IDX.currencyCode).toBe('RP')
    expect(CRYPTO.currencyCode).toBe('USD')
  })
})

describe('skala masukan ambang likuiditas', () => {
  test('IDX menerima masukan dalam miliar rupiah', () => {
    expect(IDX.minValueScale).toBe(1e9)
    expect(IDX.minValueUnit).toBe('MILIAR')
  })

  test('crypto menerima masukan dalam juta dolar', () => {
    // Tanpa skala per pasar, `--min-likuiditas 5` di crypto berarti $5 MILIAR —
    // salah 1000x, dan salah arah yang diam-diam meloloskan semua.
    expect(CRYPTO.minValueScale).toBe(1e6)
    expect(CRYPTO.minValueUnit).toBe('JUTA')
  })

  test('ambang bawaan konsisten dengan skalanya', () => {
    expect(IDX.minValue).toBe(5 * IDX.minValueScale)
    expect(CRYPTO.minValue).toBe(10 * CRYPTO.minValueScale)
  })
})

describe('nilai transaksi harian per konvensi pasar', () => {
  const bar = { date: '2026-09-30', open: 1, high: 1, low: 1, close: 80_000, volume: 28e9 }

  test('IDX: volume dalam LEMBAR, jadi nilainya close x volume', () => {
    expect(IDX.dailyValue(bar)).toBe(80_000 * 28e9)
  })

  test('crypto: volume Yahoo SUDAH dalam USD, jadi dipakai apa adanya', () => {
    // Diverifikasi dari data: volume harian BTC ~28 MILIAR. Kalau itu jumlah BTC,
    // berarti 28 miliar BTC diperdagangkan sehari — sementara pasokan maksimalnya
    // 21 juta. Mengalikannya dengan harga membuat gerbang likuiditas meloloskan
    // apa saja, karena hasilnya selalu triliunan.
    expect(CRYPTO.dailyValue(bar)).toBe(28e9)
  })
})

describe('label grafik', () => {
  test('IDX memakai label bursa dan satuan lot', () => {
    expect(IDX.exchangeLabel).toBe('IDX')
    expect(IDX.volumeUnit).toBe('lot')
    expect(IDX.toDisplayVolume(721_574_00)).toBe(721_574) // 1 lot = 100 lembar
  })

  test('crypto memakai label bursa crypto dan volume USD apa adanya', () => {
    // Volume Yahoo untuk crypto sudah dalam USD; membaginya 100 dan menyebutnya
    // "lot" salah dua kali sekaligus.
    expect(CRYPTO.exchangeLabel).toBe('CRYPTO')
    expect(CRYPTO.volumeUnit).toBe('USD')
    expect(CRYPTO.toDisplayVolume(28e9)).toBe(28e9)
  })
})

describe('barTertutup', () => {
  const bar = (date: string): Bar => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1 })
  const bars = [bar('2026-10-22'), bar('2026-10-23')]

  test('crypto: candle hari UTC berjalan dibuang — belum tutup', () => {
    expect(barTertutup(bars, CRYPTO, new Date('2026-10-23T00:15:00Z')).map((b) => b.date)).toEqual(['2026-10-22'])
  })

  test('crypto: candle kemarin yang sudah tutup tetap dipakai', () => {
    expect(barTertutup(bars, CRYPTO, new Date('2026-10-24T00:15:00Z'))).toEqual(bars)
  })

  test('IDX tidak disentuh — bar intraday IDX ditangani tanda DRAFT', () => {
    expect(barTertutup(bars, IDX, new Date('2026-10-23T03:00:00Z'))).toEqual(bars)
  })
})
