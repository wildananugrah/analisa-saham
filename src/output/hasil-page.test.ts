import { expect, test, describe } from 'bun:test'
import { buildHasilPage, loadHasilTemplate, type HasilPasar } from './hasil-page.ts'
import { buildPicks, summarize } from '../hasil/nilai.ts'

/** Ambil literal JSON yang ditanam setelah `const NAME = `. */
function embedded(html: string, name: string): any {
  const m = html.match(new RegExp(`const ${name} = (.*);\\n`))
  if (!m) throw new Error(`${name} tidak ditemukan`)
  return JSON.parse(m[1]!)
}

const picks = buildPicks(
  [{ code: 'BBCA', name: 'Bank </script> Asia', date: '2026-10-01', entry: 1000, stop: 920, target: 1200 }],
  new Map([['BBCA', [{ date: '2026-10-02', open: 1000, high: 1250, low: 990, close: 1210, volume: 1 }]]]),
)
const pasar: HasilPasar[] = [
  { id: 'idx', label: 'Saham IDX', currency: 'IDR', picks, ringkasan: summarize(picks), gagal: ['GOTO'],
    status: { tanggal: '2026-10-21', catatan: { BBCA: [['no-demand 10-21', 'bad']] } } },
]
const NOW = new Date('2026-10-22T11:00:00Z')

describe('buildHasilPage', async () => {
  const template = await loadHasilTemplate()

  test('semua placeholder template terisi', () => {
    const html = buildHasilPage(pasar, template, NOW)
    expect(html).not.toContain('/*__')
  })

  test('data pasar ditanam utuh beserta waktu pembuatan', () => {
    const data = embedded(buildHasilPage(pasar, template, NOW), 'DATA')
    expect(data.dibuat).toBe('2026-10-22 18:00 WIB')
    expect(data.pasar[0].ringkasan).toMatchObject({ total: 1, target: 1 })
    expect(data.pasar[0].picks[0]).toMatchObject({ code: 'BBCA', status: 'target', exit: 1200 })
    expect(data.pasar[0].gagal).toEqual(['GOTO'])
    expect(data.pasar[0].status).toEqual({ tanggal: '2026-10-21', catatan: { BBCA: [['no-demand 10-21', 'bad']] } })
  })

  test('</script> di data tidak menutup tag lebih awal', () => {
    const html = buildHasilPage(pasar, template, NOW)
    expect(html).not.toContain('Bank </script>')
    expect(embedded(html, 'DATA').pasar[0].picks[0].name).toBe('Bank </script> Asia')
  })
})
