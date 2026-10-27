---
name: analisa-broker
description: Analisa bandarmologi dari screenshot broker summary di broker/, digabung dengan analisa teknikal scan (out/<KODE>.json), lalu satu kesimpulan Layak / Pantau / Hindari per emiten. Pakai saat user mengetik /analisa-broker, atau meminta analisa broker / broksum / bandar atas screenshot yang sudah diunggah.
---

# Analisa broker

Gabungkan dua sisi untuk setiap emiten, lalu simpulkan dengan matriks tetap di
bawah — bukan penilaian bebas. Input yang sama harus selalu menghasilkan
kesimpulan yang sama. Ini alat penyaring, bukan anjuran jual/beli.

## Argumen

- tanpa argumen → semua screenshot di `broker/` yang belum dianalisa
- `KODE` (mis. `BSSR`) → emiten itu saja
- `YYYY-MM-DD` → screenshot yang rentangnya BERAKHIR di tanggal itu

## Langkah

### 1. Kumpulkan screenshot

Nama berkas: `<KODE>_<DARI>_<SAMPAI>[_<FILTER>][-<n>].png` (juga `.jpg`/`.jpeg`),
lihat `broker/README.md`. Kelompokkan per emiten dan per jendela:

| Jendela | Panjang rentang (hari kalender, DARI..SAMPAI inklusif) |
|---|---|
| 1 hari | 1 |
| 1 minggu | 2–10 |
| 1 bulan | 11–45 |
| panjang | > 45 (dibaca, tapi tidak ikut voting) |

`FILTER` `F` = asing saja, `D` = domestik saja; tanpa filter = semua investor.
Berkas `-1`, `-2`, … adalah potongan satu rentang yang sama: gabungkan.

Nama yang tidak sesuai pola → laporkan, jangan ditebak.

**Sudah dianalisa?** Lewati emiten+tanggal yang sudah ada di
`broker/bandar-<SAMPAI>.json` dengan daftar `berkas` yang sama persis. Ada berkas
baru → analisa ulang emiten itu dan timpa entrinya.

### 2. Baca tiap screenshot

Baca gambarnya (Read tool). Untuk tiap sisi ambil sebanyak yang terlihat (minimal
5, idealnya 10): kode broker, lot, nilai, rata-rata harga; dan tandai broker asing
kalau aplikasinya menandai (warna/label).

Periksa header gambar:
- **Rentang tanggal** harus sama dengan nama berkas. Beda → tandai `TIDAK COCOK`,
  jangan pakai gambar itu, laporkan.
- **Net vs Gross.** Net dipakai apa adanya. Gross: hitung net per broker =
  lot beli − lot jual untuk broker yang muncul di kedua sisi, dan catat bahwa
  angkanya dari Gross.
- Angka buram / terpotong → tulis apa yang terbaca dan tandai `parsial`.
  Jangan mengarang angka.

### 3. Vonis broker per jendela

Dari broker net buyer teratas dan net seller teratas:

- `B3` = jumlah nilai 3 net buyer teratas; `S3` = jumlah nilai 3 net seller teratas.
- **Konsentrasi** = B3 / nilai total semua net buyer yang terlihat.
- **Broker ritel** (daftar awal, boleh diubah user di sini): `YP XL PD XC CC KK`.
- **Rata-rata beli bandar** = rata-rata harga 3 net buyer teratas, berbobot lot.

| Vonis jendela | Syarat |
|---|---|
| akumulasi | B3 ≥ 1,2 × S3 **dan** paling banyak 1 dari 3 buyer teratas broker ritel |
| distribusi | S3 ≥ 1,2 × B3 dengan paling banyak 1 dari 3 seller teratas ritel, **atau** ≥ 2 dari 3 buyer teratas ritel sementara ≤ 1 seller teratas ritel (barang pindah ke ritel) |
| netral | selain itu |

Screenshot `_F`: net asing positif/negatif dicatat sebagai **asing net**, bukan
vonis tersendiri.

### 4. Vonis broker gabungan

Voting atas jendela 1 hari, 1 minggu, 1 bulan yang tersedia:

- **akumulasi**: mayoritas akumulasi **dan** jendela 1 minggu tidak distribusi.
- **distribusi**: mayoritas distribusi, **atau** 1 minggu dan 1 bulan sama-sama distribusi.
- **netral**: selain itu.

Kekuatan: **kuat** = semua jendela yang ada sepakat dan ada ≥ 3 jendela;
**sedang** = mayoritas; **lemah** = hanya 1 jendela tersedia (selalu sebut ini).

### 5. Sisi teknikal

Baca `out/<KODE>.json` (ditulis scan pukul 05:00 WIB):

- `date` — tanggal data teknikal
- `gates.passed`, `gates.failures`
- `metrics.riskReward.value` → entry, stop, target, ratio
- `metrics.structure`, `wyckoff`, `vpa`, `volume`, `strength`, `volatility` untuk bukti

Catatan risiko (kolom Status screener) dari `report/status-<date>.json` dengan
`<date>` = `date` di atas. Kalau berkas itu tidak ada, susun dengan aturan yang
sama: Wyckoff distribusi/markdown (bad), VPA terakhir upthrust/no-demand (bad),
fase rebound (warn), divergensi OBV bearish (warn), baca volume
tekanan-jual/rally-lemah (warn), R:R < 1 (warn).

Kategori teknikal:
- **lolos bersih** — `gates.passed` dan tanpa catatan
- **lolos dengan catatan** — `gates.passed` dan ada catatan
- **gagal gerbang** — selain itu

Cut loss evaluasi = stop dijepit ke 5–10% di bawah entry:
`min(entry × 0,95, max(entry × 0,90, stop))`.

**Umur data.** `date` teknikal ≠ tanggal SAMPAI screenshot 1 hari →
tetap gabungkan, sebutkan selisihnya. Lebih dari 1 hari bursa, atau
`out/<KODE>.json` tidak ada (emiten di luar watchlist) → analisa broker saja dan
kesimpulan maksimal **Pantau**.

Status pilihan: cari kode di `report/hasil-<terbaru>/hasil.json` → `pasar[id=idx].picks`
(status `open`/`target`/`cut`, `ret`, `progress`).

### 6. Kesimpulan — matriks tetap

| Teknikal ↓ / Broker → | akumulasi | netral | distribusi |
|---|---|---|---|
| lolos bersih | **Layak** | Pantau | Hindari |
| lolos dengan catatan | Pantau | Pantau | Hindari |
| gagal gerbang | Pantau | Hindari | Hindari |

Lalu aturan penimpa, berurutan:

1. **Bandar sudah untung besar**: close > rata-rata beli bandar (jendela terpanjang) × 1,15 → turun satu tingkat (Layak → Pantau → Hindari).
2. **R:R < 1** → tidak pernah Layak (jadi Pantau).
3. **Vonis broker lemah** (hanya 1 jendela) → tidak pernah Layak.
4. Data teknikal tertinggal / tidak ada → maksimal Pantau (langkah 5).

Catat setiap penimpa yang dipakai. Close < rata-rata beli bandar bukan penimpa,
tapi tulis sebagai bukti positif (bandar masih rugi dan tetap menampung).

## Keluaran

Kelompokkan per tanggal `SAMPAI` terakhir tiap emiten.

### `broker/analisa-<TANGGAL>.md`

Tambahkan atau ganti bagian emiten itu (jangan hapus bagian emiten lain):

```markdown
## BSSR — Layak

Data broker s.d. 2026-10-27 · teknikal 2026-10-26 · close 5.225 · /hasil/: terbuka, +0,5%

| Jendela | Net buyer teratas | Net seller teratas | B3 : S3 | Konsentrasi | Rata-rata beli | Vonis |
|---|---|---|---|---|---|---|
| 1 hari | AK, BK, ZP | YP, XL, PD | 1,8 : 1 | 62% | 5.190 | akumulasi |

**Broker: akumulasi (kuat).** <2–4 poin bukti>
**Teknikal: lolos bersih.** <fase, Wyckoff, VPA, volume, RS60 — 2–3 poin>
**Rencana:** entry 5.200 · stop 4.933 · target 5.500 · R:R 1:1,13 · cut loss evaluasi 4.940
**Penimpa:** — (atau daftar yang dipakai)
**Yang membatalkan:** <kondisi konkret yang akan menurunkan kesimpulan>

Berkas: BSSR_2026-10-27_2026-10-27.png, …
```

Baris pertama berkas, kalau baru: `# Analisa broker <TANGGAL>` dan satu kalimat
"Penyaringan, bukan anjuran jual/beli."

### `broker/bandar-<TANGGAL>.json`

Gabungkan ke isi yang ada (objek per kode). Hanya vonis, bukan angka mentah broker:

```json
{
  "BSSR": {
    "kesimpulan": "Layak",
    "broker": { "vonis": "akumulasi", "kekuatan": "kuat", "jendela": { "1h": "akumulasi", "1m": "akumulasi", "1b": "netral" } },
    "teknikal": { "kategori": "lolos bersih", "tanggal": "2026-10-26" },
    "penimpa": [],
    "berkas": ["BSSR_2026-10-27_2026-10-27.png"]
  }
}
```

### Ringkasan di chat

Satu baris per emiten: `KODE — Kesimpulan · broker <vonis> (<kekuatan>) · teknikal <kategori> · bukti terkuat`.
Lalu daftar berkas yang dilewati atau bermasalah (nama salah, tanggal tidak
cocok, parsial) beserta sebabnya, dan jalur kedua berkas keluaran.
