import { metric, unavailable, type Metric } from './metric.ts'
import type { LevelsRead } from './levels.ts'

/** Di bawah 1:2, lewati saja — sebagus apa pun sisanya. */
export const MIN_RR_DEFAULT = 2

/** Bantalan stop, dalam kelipatan ATR, supaya tidak tersapu derak harian biasa. */
const BANTALAN_ATR = 0.5

export interface RiskRewardRead {
  entry: number
  stop: number
  target: number
  ratio: number
  passesGate: boolean
}

/**
 * Di sinilah penilaian level tadi terbayar: stop dipasang di bawah support
 * bernilai terbaik, target di resistance bernilai terbaik.
 *
 * Bantalan setengah ATR ada supaya stop tidak nempel persis di angka yang semua
 * orang lihat — level yang ramai justru sering ditembus tipis sebelum berbalik.
 */
export function analyzeRiskReward(
  close: number,
  atrValue: number,
  levels: LevelsRead,
  minRatio = MIN_RR_DEFAULT,
  /**
   * Target paling jauh, sebagai pecahan di atas entry (0,1 = +10%). Uji ulang
   * menunjukkan resistance terdekat pun sering terlalu jauh: dengan target
   * analisa apa adanya cut loss lebih sering kena duluan. Tanpa nilai = tanpa batas.
   */
  targetCap?: number,
): Metric<RiskRewardRead> {
  // TERDEKAT, bukan yang skornya tertinggi.
  //
  // Level bernilai tinggi bisa berada jauh dari harga — memakainya sebagai target
  // membesar-besarkan imbalan (dan sebagai stop, membesar-besarkan risiko) untuk
  // perjalanan harga yang tidak akan terjadi lebih dulu. Yang pertama disentuh
  // harga adalah yang terdekat, jadi itu yang dipakai. Daftar yang masuk ke sini
  // sudah disaring findLevels jadi tiga terbaik tiap arah, jadi "terdekat" di sini
  // tetap berarti terdekat DI ANTARA YANG BERMUTU.
  const support = [...levels.supports].sort((a, b) => b.price - a.price)[0]
  const resistance = [...levels.resistances].sort((a, b) => a.price - b.price)[0]

  if (!support) return unavailable('Tidak ada support di bawah harga — stop tidak punya sandaran.')
  if (!resistance) return unavailable('Tidak ada resistance di atas harga — target tidak terukur.')

  const entry = close
  const stop = support.price - BANTALAN_ATR * atrValue
  const capped = targetCap !== undefined && targetCap > 0 && resistance.price > entry * (1 + targetCap)
  const target = capped ? entry * (1 + targetCap!) : resistance.price

  const risk = entry - stop
  const reward = target - entry
  if (risk <= 0 || reward <= 0) {
    return unavailable(
      `Stop ${Math.round(stop)} atau target ${Math.round(target)} berada di sisi yang salah dari entry ${Math.round(entry)}.`,
    )
  }

  const ratio = reward / risk
  // Ambang 0 berarti R:R bukan syarat gerbang. Rasionya tetap dicetak, tapi tidak
  // boleh terbaca "memadai" hanya karena lolos ambang yang tidak ada.
  const isGate = minRatio > 0
  const passesGate = ratio >= minRatio
  const label = !isGate ? 'R:R' : passesGate ? 'R:R memadai' : 'R:R TIPIS'

  return metric(
    { entry, stop, target, ratio, passesGate },
    `${label} 1:${ratio.toFixed(2)}${isGate ? '' : ' (bukan syarat gerbang)'} — entry ${Math.round(entry)}, stop ${Math.round(stop)}, target ${Math.round(target)}`,
    support.score >= 0.6 && resistance.score >= 0.6 ? 'sedang' : 'rendah',
    [
      `Risiko ${Math.round(risk)} per lembar (entry ${Math.round(entry)} → stop ${Math.round(stop)}, support ${support.price} dikurangi ${BANTALAN_ATR}×ATR).`,
      capped
        ? `Imbalan ${Math.round(reward)} per lembar: target dibatasi +${Math.round(targetCap! * 100)}% dari entry (resistance ${resistance.price} lebih jauh).`
        : `Imbalan ${Math.round(reward)} per lembar (entry → resistance ${target}).`,
      isGate ? `Ambang minimum 1:${minRatio}.` : 'R:R bukan syarat gerbang run ini; angkanya untuk dibaca, bukan penyaring.',
    ],
  )
}
