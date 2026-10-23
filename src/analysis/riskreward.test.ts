import { expect, test, describe } from 'bun:test'
import { analyzeRiskReward, MIN_RR_DEFAULT } from './riskreward.ts'
import type { Level, LevelsRead } from './levels.ts'

function level(price: number, score = 0.8): Level {
  return {
    price,
    score,
    touches: 4,
    volumeShare: 0.1,
    lastTouchDate: '2026-09-01',
    barsSinceTouch: 5,
    isRound: false,
  }
}

const levels = (supports: number[], resistances: number[]): LevelsRead => ({
  supports: supports.map((p) => level(p)),
  resistances: resistances.map((p) => level(p)),
})

describe('analyzeRiskReward', () => {
  test('stop di bawah support terbaik, diberi bantalan setengah ATR', () => {
    const m = analyzeRiskReward(1000, 20, levels([950], [1200]))
    expect(m.value!.stop).toBeCloseTo(940, 6) // 950 - 0,5 x 20
  })

  test('targetCap memotong target ke entry + batas, dan rasionya ikut target itu', () => {
    const v = analyzeRiskReward(1000, 20, levels([950], [1200]), 0, 0.1).value!
    expect(v.target).toBeCloseTo(1100, 6)
    expect(v.ratio).toBeCloseTo(100 / 60, 6)
  })

  test('targetCap tidak menjauhkan target yang sudah lebih dekat', () => {
    expect(analyzeRiskReward(1000, 20, levels([950], [1050]), 0, 0.1).value!.target).toBe(1050)
  })

  test('target adalah resistance terbaik di atas harga', () => {
    expect(analyzeRiskReward(1000, 20, levels([950], [1200])).value!.target).toBe(1200)
  })

  test('rasio adalah imbalan dibagi risiko', () => {
    // Risiko 1000-940 = 60; imbalan 1200-1000 = 200 → 3,33.
    expect(analyzeRiskReward(1000, 20, levels([950], [1200])).value!.ratio).toBeCloseTo(200 / 60, 6)
  })

  test('rasio di bawah ambang gagal gerbang', () => {
    // Risiko 60, imbalan 60 → 1,0.
    expect(analyzeRiskReward(1000, 20, levels([950], [1060])).value!.passesGate).toBe(false)
  })

  test('rasio di atas ambang lolos gerbang', () => {
    expect(analyzeRiskReward(1000, 20, levels([950], [1200])).value!.passesGate).toBe(true)
  })

  test('ambang bawaan 1:2', () => {
    expect(MIN_RR_DEFAULT).toBe(2)
  })

  test('tanpa support di bawah harga, rasio tidak bisa dihitung', () => {
    const m = analyzeRiskReward(1000, 20, levels([], [1200]))
    expect(m.available).toBe(false)
    expect(m.verdict).toMatch(/support/i)
  })

  test('tanpa resistance di atas harga, rasio tidak bisa dihitung', () => {
    const m = analyzeRiskReward(1000, 20, levels([950], []))
    expect(m.available).toBe(false)
    expect(m.verdict).toMatch(/resistance/i)
  })

  test('stop yang menyentuh atau melewati entry ditolak, bukan menghasilkan rasio negatif', () => {
    // Support DI ATAS entry — tidak masuk akal, harus ditangkap, bukan menghasilkan
    // risiko negatif yang diam-diam membalik rasionya.
    const m = analyzeRiskReward(1000, 20, levels([1010], [1200]))
    expect(m.available).toBe(false)
    expect(m.verdict).toMatch(/sisi yang salah/i)
  })

  test('vonis menyebut entry, stop, dan target', () => {
    const v = analyzeRiskReward(1000, 20, levels([950], [1200])).verdict
    expect(v).toContain('1000')
    expect(v).toContain('940')
    expect(v).toContain('1200')
  })
})

describe('analyzeRiskReward — memilih level TERDEKAT, bukan yang skornya tertinggi', () => {
  test('target adalah resistance terdekat di atas harga, bukan yang paling bernilai', () => {
    // Resistance 252 skornya lebih tinggi, tapi 216 lebih dekat — itu yang realistis
    // tersentuh lebih dulu, jadi itu yang jadi target.
    const l: LevelsRead = {
      supports: [level(200, 0.87)],
      resistances: [level(252, 0.87), level(216, 0.86)],
    }
    expect(analyzeRiskReward(208, 10, l).value!.target).toBe(216)
  })

  test('stop bersandar pada support terdekat di bawah harga', () => {
    const l: LevelsRead = {
      supports: [level(150, 0.9), level(200, 0.5)],
      resistances: [level(260, 0.8)],
    }
    // Support 150 skornya lebih tinggi, tapi 200 lebih dekat.
    expect(analyzeRiskReward(208, 10, l).value!.stop).toBeCloseTo(195, 6)
  })

  test('memakai level terdekat membuat R:R tidak dilebih-lebihkan', () => {
    const l: LevelsRead = {
      supports: [level(200, 0.87)],
      resistances: [level(252, 0.87), level(216, 0.86)],
    }
    // Dengan target 216: imbalan 8, risiko 13 → 0,62. Dengan 252 tadinya 3,39.
    expect(analyzeRiskReward(208, 10, l).value!.ratio).toBeLessThan(1)
  })
})

describe('analyzeRiskReward — R:R bukan syarat gerbang', () => {
  test('minRatio 0: verdict menyebut bukan syarat gerbang, bukan "memadai"', () => {
    // Risiko 60, imbalan 30 → 0,5. Bukan gerbang, jadi tidak boleh terbaca "memadai".
    const m = analyzeRiskReward(1000, 20, levels([950], [1030]), 0)
    expect(m.verdict).toContain('bukan syarat gerbang')
    expect(m.verdict).not.toMatch(/memadai|TIPIS/)
  })

  test('minRatio 0: bukti tidak mencetak "ambang 1:0"', () => {
    const m = analyzeRiskReward(1000, 20, levels([950], [1030]), 0)
    expect(m.evidence.join(' ')).not.toContain('1:0.')
  })
})
