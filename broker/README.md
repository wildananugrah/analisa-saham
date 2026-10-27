# broker/

Screenshot broker summary untuk `/analisa-broker` (lihat
`.claude/skills/analisa-broker/SKILL.md`). Isi folder ini tidak masuk git dan
tidak diterbitkan — hanya README ini.

## Nama berkas

```
<KODE>_<DARI>_<SAMPAI>[_<FILTER>][-<n>].png
```

| Contoh | Arti |
|---|---|
| `BSSR_2026-10-27_2026-10-27.png` | 1 hari |
| `BSSR_2026-10-21_2026-10-27.png` | 1 minggu |
| `BSSR_2026-09-28_2026-10-27.png` | 1 bulan |
| `BSSR_2026-09-28_2026-10-27_F.png` | 1 bulan, investor asing saja |
| `BSSR_2026-10-27_2026-10-27-2.png` | potongan kedua dari rentang yang sama |

- Kode huruf besar, tanpa `.JK`. Tanggal `YYYY-MM-DD`, sama dengan rentang yang dipilih di aplikasi.
- `FILTER`: `F` asing, `D` domestik. Tanpa filter = semua investor.
- `.png` disarankan; `.jpg` juga dibaca.

## Isi screenshot

- Sisi **buyer dan seller** dalam satu gambar.
- Kolom: kode broker, lot, nilai, **rata-rata harga** untuk tiap sisi.
- Minimal **10 broker** per sisi.
- **Header terlihat**: rentang tanggal dan mode **Net** (disarankan) atau Gross.
- Terbaca: lebar ±1000 px atau lebih, angka tidak terpotong.

## Per emiten

Idealnya 3 jendela — **1 hari, 1 minggu, 1 bulan** — berakhir di hari bursa
yang sama dengan scan terakhir (`out/<KODE>.json`, pukul 05:00 WIB memakai bar
hari bursa sebelumnya).

## Keluaran

- `analisa-<TANGGAL>.md` — laporan per emiten: vonis broker, teknikal, kesimpulan
  **Layak / Pantau / Hindari** beserta buktinya.
- `bandar-<TANGGAL>.json` — vonisnya saja, untuk dibandingkan dengan `/hasil/`.
