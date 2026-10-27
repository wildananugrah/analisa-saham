import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inlineJson, jakartaStamp } from './screener.ts'
import type { Hasil, Ringkasan } from '../hasil/nilai.ts'
import type { MarketId } from '../market.ts'
import type { Catatan } from './screener.ts'

/**
 * Halaman rekam jejak: satu tab per pasar, ringkasan di atas, lalu pilihan yang
 * masih terbuka dan yang sudah selesai. Semua data ditanam di index.html —
 * jumlah pilihan jauh lebih kecil dari jumlah baris screener.
 */

export interface HasilPasar {
  id: MarketId
  label: string
  /** Kode mata uang untuk format harga di halaman: IDR atau USD. */
  currency: string
  picks: Hasil[]
  ringkasan: Ringkasan
  /** Emiten yang barnya gagal diambil di run ini. */
  gagal: string[]
  /**
   * Catatan risiko dari scan tercatat terakhir, per kode — kolom STATUS screener.
   * null kalau belum ada status-<TANGGAL>.json.
   */
  status: { tanggal: string; catatan: Record<string, Catatan[]> } | null
}

export function buildHasilPage(pasar: HasilPasar[], template: string, now: Date): string {
  const data = { dibuat: jakartaStamp(now), pasar }
  // Fungsi pengganti, bukan string: `$&` di data tidak boleh ditafsir sebagai pola.
  return template.replace('/*__DATA__*/{}', () => inlineJson(data))
}

export async function loadHasilTemplate(): Promise<string> {
  return readFile(new URL('./hasil-template.html', import.meta.url), 'utf8')
}

/** Tulis halaman ke `dir`/index.html beserta hasil.json mentahnya. Mengembalikan jalur index.html. */
export async function writeHasilPage(dir: string, pasar: HasilPasar[], now: Date): Promise<string> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'hasil.json'), JSON.stringify({ dibuat: jakartaStamp(now), pasar }, null, 1))
  const index = join(dir, 'index.html')
  await writeFile(index, buildHasilPage(pasar, await loadHasilTemplate(), now))
  return index
}
