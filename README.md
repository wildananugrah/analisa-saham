# idx-chart-downloader

Sebut kode emiten, dapat satu PNG grafik harian bergaya TradingView: candle, volume,
MA volume, MA 10/20/50/100/200, dan volume profile atas rentang yang tampil.

## Jalankan

```bash
bun install
bun run src/cli.ts                 # semua kode di watchlist.txt
bun run src/cli.ts BBCA            # satu emiten
bun run src/cli.ts BBCA BBRI TLKM  # beberapa sekaligus
bun run src/cli.ts BBCA --days 120 --rows 12 --svg
```

Keluaran: `out/<KODE>.png` (2000 × 880). Balasan mentah Yahoo disimpan di `raw/`
sebagai jejak audit.

| Opsi | Arti | Bawaan |
|---|---|---|
| `--days N` | Panjang jendela tampil dalam bar | 250 |
| `--rows N` | Jumlah baris profil volume | 24 |
| `--out DIR` | Direktori keluaran | `out` |
| `--watchlist BERKAS` | Daftar kode, satu per baris | `watchlist.txt` |
| `--svg` | Simpan juga SVG-nya | mati |

Argumen posisional menang atas watchlist. Emiten yang gagal diambil dicatat dan
dilewati; emiten berikutnya tetap jalan, exit code jadi 1 di akhir.

## Yang perlu diketahui sebelum membaca grafiknya

**Volume ditampilkan dalam LOT.** Yahoo mengirimnya dalam lembar; angkanya dibagi 100
supaya bisa dibandingkan langsung dengan TradingView.

**Profil volume adalah aproksimasi.** Bar harian tidak membawa distribusi intraday,
jadi volume tiap hari disebar rata pada rentang `low..high` hari itu. Yang terlihat
adalah di rentang harga mana hari-hari bervolume besar kebetulan berdagang, bukan di
harga mana volume sesungguhnya terjadi. Berguna untuk melihat area konsolidasi;
jangan dipakai sebagai level presisi. Catatan ini ikut tercetak di tiap gambar.

**MA 200 butuh pemanasan.** Riwayat yang diambil selalu lebih panjang dari yang
digambar, supaya garis MA sudah bernilai sejak candle pertama. Emiten yang riwayatnya
lebih pendek dari periode MA akan menampilkan garis yang mulai belakangan — itu jujur,
bukan kesalahan.

**Hari tanpa perdagangan dibuang.** Yahoo tetap mengirim baris untuk hari suspensi
dengan medan `null`; baris begitu dilewati, bukan digambar sebagai candle di harga nol.

## Scan analisis 12 metrik

```bash
bun run src/scan.ts                     # semua kode di watchlist.txt
bun run src/scan.ts BBCA BBRI           # beberapa emiten
bun run src/scan.ts --min-likuiditas 20 # ambang likuiditas Rp 20 miliar
bun run src/scan.ts --tanpa-idx         # lewati IDX, jalankan 9 metrik Yahoo saja
bun run src/scan.ts --tanpa-html        # tanpa halaman screener HTML
```

Keluaran sekaligus lima rupa: tabel terminal, `report/scan-<TANGGAL>.csv`,
`report/scan-<TANGGAL>.xlsx`, halaman `report/screener-<TANGGAL>/index.html`,
dan `out/<KODE>.json` berisi detail penuh tiap metrik beserta buktinya.

| Opsi | Arti | Bawaan |
|---|---|---|
| `--days N` | Panjang jendela analisis | 250 |
| `--min-likuiditas MILIAR` | Ambang nilai transaksi harian | 5 |
| `--min-rr N` | Ambang risk/reward | bukan syarat |
| `--min-tren N` | Skor tren MA minimum, 0..1 (0 = mati) | 1 (5/5 syarat) |
| `--maks-atr PERSEN` | ATR maksimum | 5,1 IDX / 7,6 crypto |
| `--target-maks PERSEN` | Batas target di atas entry (0 = tanpa batas) | 10 |
| `--hari-idx N` | Hari bursa riwayat IDX (aliran asing, RS sektor) | 65 |
| `--tanpa-idx` | Matikan lapisan IDX | menyala |
| `--tanpa-html` | Jangan tulis halaman screener HTML | menyala |
| `--draft` / `--final` | Paksa tanda DRAFT intraday di halaman HTML | otomatis |

### Halaman screener HTML

`report/screener-<TANGGAL>/` berisi `index.html` dan folder `data/`. Isinya dari
baris yang sama dengan CSV/Excel, jadi tidak pernah berbeda angka.

- Tabel semua emiten (tab **Lolos / Tersaring / Semua**), bisa diurutkan per
  kolom, dicari, dan disaring per fase, Wyckoff, tanpa peringatan, likuid saja.
- **Tanpa peringatan** berarti tidak ada catatan dari Wyckoff (distribusi/markdown),
  VPA (upthrust/no-demand), fase rebound, divergensi OBV bearish, baca volume
  (tekanan jual/rally lemah), dan R:R di bawah 1. Bukan jaminan.
- Klik kode emiten untuk membuka laci: rencana entry/stop/target, cut loss
  evaluasi (stop dijepit 5–10% seperti di `/hasil/`), alasan
  gerbang, grafik 180 bar (candle, MA20/50/200, volume, garis support/resistance,
  penanda VPA), dan vonis + bukti tiap metrik. `index.html#KODE` langsung
  membuka emiten itu.
- Tabel ditanam utuh di `index.html` (~0,8 MB untuk ~900 emiten). Detail dan bar
  dipecah per 60 emiten ke `data/detail-N.json` dan `data/bars-N.json` (~15 MB
  total) dan baru dimuat saat kode diklik — **sajikan foldernya lewat server**
  (`python3 -m http.server -d report/screener-<TANGGAL>`), karena peramban
  menolak `fetch` dari `file://`.
- Spanduk **DRAFT** muncul otomatis untuk IDX kalau bar terakhir bertanggal hari
  ini dan scan dijalankan sebelum 16:15 WIB (volume hari itu belum lengkap).
  Paksa dengan `--draft` atau `--final`. Spanduk **terdegradasi** muncul kalau
  ada kolom peringkat yang hilang, berikut sebabnya apa adanya (mis. `--tanpa-idx`).
- Ambang gerbang, satuan uang, dan satuan volume ikut pasar dan opsi run
  (`--market crypto` menampilkan dolar dan volume USD).

### Isi berkas Excel

Tiga jenis sheet:

| Sheet | Isi |
|---|---|
| **Scan** | Satu baris per emiten yang **lolos** gerbang, terurut skor menurun. Header dibekukan dan berfilter. |
| **Tersaring** | Emiten yang **gagal** gerbang berikut alasannya. Bukan berarti jelek — cuma tidak lolos syarat. |
| **<KODE>** | Satu sheet per emiten: tiap metrik berikut `TERSEDIA`, `KEYAKINAN`, `VONIS`, dan `BUKTI`-nya. Ini tempat memeriksa **kenapa** sebuah baris dinilai begitu. |

Berkas CSV memuat **semua** emiten dalam satu tabel — lolos maupun tersaring —
dengan kolom `GERBANG` sebagai pembedanya. Kalau lebih suka menyaring sendiri
ketimbang pindah tab, pakai yang itu.

### Arti tiap kolom

**Identitas**

| Kolom | Arti |
|---|---|
| `KODE` | Kode emiten. |
| `NAMA` | Nama panjang dari Yahoo. |
| `TANGGAL` | Tanggal bar terakhir yang dianalisis — bukan tanggal run. Kalau emiten disuspensi, tanggal ini tertinggal. |
| `CLOSE` | Harga penutupan pada `TANGGAL`. |

**Peringkat** — empat kolom terukur yang menentukan urutan, semuanya 0..1

| Kolom | Arti |
|---|---|
| `SKOR` | Rata-rata kolom peringkat yang **tersedia**. Inilah yang mengurutkan tabel. |
| `TREND` | Dari susunan MA (#10): berapa dari 5 syarat terpenuhi — `close > MA20`, `MA20 > MA50`, `MA50 > MA200`, MA50 menanjak, MA200 menanjak. 1,00 berarti kelimanya. |
| `RS60` | Kekuatan relatif 60 hari terhadap IHSG, dipetakan ke 0..1. 0,5 berarti setara IHSG; di atas itu unggul. |
| `RVOL_SKOR` | Mutu konfirmasi volume (#1): bagian dari 10 bar terakhir yang volumenya sejalan dengan arah harganya. |
| `ASING_SKOR` | Arah bersih aliran asing 20 hari, dinormalkan. 0,5 datar, di atasnya akumulasi. `n/a` kalau IDX tidak terjangkau. |
| `KOLOM_DIPAKAI` | Kolom mana saja yang benar-benar masuk `SKOR`. **Periksa ini sebelum membandingkan skor antar-hari** — kalau isinya berbeda, skornya tidak sebanding. |

**Volume terhadap harga (#1)**

| Kolom | Arti |
|---|---|
| `RVOL` | Volume hari terakhir dibagi rata-rata 20 hari **sebelumnya**. 1,00 = normal, 2,00 = dua kali lipat. |
| `VOLUME_BACA` | Pembacaan effort-vs-result hari terakhir. Nilainya: `permintaan-sejati` (naik ditopang volume), `rally-lemah` (naik tapi volume kering — rawan gagal), `koreksi-sehat` (turun dengan volume rendah), `tekanan-jual` (turun dengan volume besar), `absorpsi` (volume besar tapi harga nyaris diam — ada yang menyerap), `netral`. |

**Struktur dan fase (#2)**

| Kolom | Arti |
|---|---|
| `TREN_HARIAN` | `uptrend` / `downtrend` / `sideways`, dari dua swing high dan dua swing low terakhir. |
| `TREN_MINGGUAN` | Sama, atas bar mingguan. Dipakai sebagai arah; kalau bertentangan dengan harian, keyakinannya turun. |
| `FASE` | Posisi di dalam struktur: `pullback` (mundur dalam uptrend — peluang beli), `rebound` (naik dalam downtrend — sering jebakan), `impulse`, `datar`. **Pullback dan rebound bisa terlihat mirip di grafik; bedanya ada di struktur.** |

**Kekuatan relatif (#9)**

| Kolom | Arti |
|---|---|
| `RS60_POIN` | Selisih return 60 hari terhadap IHSG, dalam **poin persen**. `+14,8` berarti unggul 14,8 poin dari IHSG. |
| `RS_SEKTOR_POIN` | Sama, terhadap indeks sektornya. `n/a` tanpa IDX — Yahoo tidak punya riwayat indeks sektor IDX. |

**Filter tren dan volatilitas (#10, #11)**

| Kolom | Arti |
|---|---|
| `MA_TERSUSUN` | `ya` kalau `close > MA20 > MA50 > MA200`. `tidak` bukan berarti jelek — lihat `TREND` untuk nilai bertahapnya. |
| `DIVERGENSI_OBV` | `bullish` (harga mencetak low baru, OBV justru lebih tinggi — tekanan jual mengering), `bearish` (kebalikannya), `n/a` kalau tidak ada. |
| `ATR_PERSEN` | ATR 14 hari sebagai persen harga — derak harian normal emiten ini. **Stop yang lebih sempit dari angka ini akan tersapu tanpa sebab.** |

**Likuiditas (#5)**

| Kolom | Arti |
|---|---|
| `NILAI_HARIAN_RP` | Rata-rata nilai transaksi harian 20 hari, **rupiah**. Ini gerbang pertama. |
| `FREE_FLOAT_PERSEN` | `WeightForIndex / ListedShares` dari IDX. Makin kecil, makin gampang harganya digerakkan. `n/a` tanpa IDX. |

**Rencana dagang (#3, #4, #12)**

| Kolom | Arti |
|---|---|
| `ENTRY` | Harga penutupan terakhir — titik acuan, bukan anjuran masuk. |
| `STOP` | Support bernilai **terdekat** di bawah harga, dikurangi bantalan 0,5×ATR supaya tidak nempel di angka yang semua orang lihat. |
| `TARGET` | Resistance bernilai terdekat di atas harga. |
| `RR` | `(TARGET − ENTRY) / (ENTRY − STOP)`. Bukan syarat gerbang (lihat di bawah); di bawah 1 dicatat sebagai peringatan di halaman HTML. |

Level yang **sedang dipijak harga** tidak dihitung sebagai support maupun resistance —
lihat catatan di bawah.

**Sinyal tafsir (#6, #7) — tidak ikut memeringkat**

| Kolom | Arti |
|---|---|
| `VPA_TERAKHIR` | Bar penanda terakhir dalam 30 bar: `spring` (menembus support lalu pulih), `stopping-volume` (jual deras diserap di dekat dasar), `no-supply` (turun tanpa penjual — bullish), `no-demand` (naik tanpa pembeli — bearish), `upthrust` (menembus ke atas lalu ditolak — bearish). |
| `VPA_TANGGAL` | Kapan sinyal itu terjadi. **Sinyal dua pekan lalu tidak sama beratnya dengan sinyal kemarin.** |
| `WYCKOFF` | `akumulasi`, `markup`, `distribusi`, `markdown`, `tidak-jelas`. Hanya `markup` — atau akumulasi akhir setelah spring terkonfirmasi — yang nyaman untuk posisi beli. |

**Aliran asing (#8)**

| Kolom | Arti |
|---|---|
| `ASING20_LEMBAR` | Net beli asing 20 hari dalam **LEMBAR**. Ini satuan asli IDX. |
| `ASING20_RP_ESTIMASI` | Nilai rupiahnya — **estimasi**, hasil `lembar × close`, bukan angka terbitan IDX. |
| `ASING_UMUR_HARI` | Umur data IDX dalam hari. Kosong berarti data hari itu juga; `4` berarti dipakai cache empat hari lalu. |

**Gerbang**

| Kolom | Arti |
|---|---|
| `GERBANG` | `lolos`, atau alasan gagalnya berikut angkanya. Sel diwarnai hijau/merah. |

### Membaca angkanya tanpa salah paham

- **`n/a` bukan nol.** `n/a` berarti datanya tidak ada; nol berarti nilainya memang nol.
  Net asing nol artinya asing tidak bergerak, net asing `n/a` artinya kita tidak tahu.
- **Bandingkan `KOLOM_DIPAKAI` sebelum membandingkan `SKOR`.** Skor dari tiga kolom
  tidak sebanding dengan skor dari empat kolom.
- **Level yang sedang dipijak harga tidak dihitung.** Kalau harga sedang berdiri di
  sebuah level, level itu bukan target maupun stop — ia cuma tempat harga berada.
  Tanpa aturan ini, pembulatan beberapa rupiah menentukan apakah level tadi jadi
  "resistance" (R:R jeblok) atau "support" (R:R melambung). Diukur pada 46 emiten,
  artefak itu memengaruhi 14 dari 37 baris yang tersaring keluar.
- **R:R bukan lagi syarat gerbang** (sejak uji ulang 2026-10-22). Gerbang 1:2
  memilih target yang jauh, dan di uji ulang target itu jarang tercapai sebelum cut
  loss: hanya 20% (IDX) dan 6% (crypto). Kolom R:R tetap dihitung dan ditampilkan;
  `--min-rr 2` mengembalikan syarat lama.

### Gerbang dan peringkat

**Gerbang** — gagal salah satu, emiten dicoret dari daftar berikut alasannya:

1. **Likuiditas** (#5): nilai transaksi harian ≥ Rp 5 M (crypto $10 jt).
   Selain itu, emiten yang bar terakhirnya lebih tua dari bar terbaru run
   (suspensi, atau Yahoo tertinggal) dicoret dengan alasan `Data tertinggal`.
   Tanggal run diambil dari bar terbaru semua emiten, bukan emiten pertama.
2. **Rencana terukur** (#12): ada support di bawah dan resistance di atas harga.
3. **Tren MA penuh** (#10): kelima syarat — close > MA20 > MA50 > MA200, MA50 dan
   MA200 menanjak.
4. **Volatilitas tenang** (#11): ATR ≤ 5,1% (crypto 7,6%) — median uji ulang.

Target rencana dibatasi maksimal **+10%** dari entry. Dasarnya uji ulang 2 tahun
(`src/replay.ts`): tren penuh + ATR ≤ median adalah satu-satunya kombinasi yang
unggul di kedua pasar dan kedua paruh waktunya — IDX naik 20 hari 45,9% vs 40,8%
baseline, crypto 50,2% vs 37,1%. **Rata-rata return per trade masih sedikit
negatif** (sekitar −0,8%): menang lebih sering, tapi kemenangannya lebih kecil dari
cut loss-nya.

**Peringkat** dijumlah dari empat kolom terukur — `trend`, `rs60`, `rvol`, `asing` —
yang semuanya ikut dicetak supaya urutannya bisa diaudit. **Wyckoff dan VPA tidak
pernah ikut memeringkat**; keduanya tafsir, dan merata-ratakannya bersama angka
terukur akan menyelundupkan keyakinan yang tidak ditanggung metodenya.

### Kalau IDX mati

IDX adalah lapisan **pengaya**, bukan fondasi. Tiga metrik bergantung padanya —
free float (#5), aliran asing (#8), dan RS sektor (#9) — **sembilan sisanya tidak**.

Saat IDX gagal, scan tetap selesai: metrik yang terpengaruh ditandai `n/a` (bukan
nol), data cache dipakai dengan umurnya dicetak **di tiap sel** (`(4h)`), dan tabel
memberi spanduk `TERDEGRADASI` yang menyebut kolom mana yang hilang. Peringkat yang
tersusun dari kolom berbeda tidak sebanding antar-run, dan itu harus terlihat.

Diuji betulan pada 2026-09-17: IDX melayani satu tanggal lalu membalas HTTP 403
Cloudflare untuk sisanya. Scan tetap menghasilkan seluruh keluaran, exit code 0.

### Yang TIDAK bisa diberikan

**Bandarmology tingkat broker.** Net beli/jual per broker tidak diterbitkan IDX
secara publik — hanya ada di penyedia berbayar. Aliran asing adalah proksi parsial,
bukan penggantinya. "Akumulasi konsisten oleh beberapa broker" justru sinyal yang
tidak tersedia di sini.

### Metrik yang paling lemah

Fase Wyckoff (#7) dan bar sinyal VPA (#6) adalah **aturan heuristik**, bukan vonis.
Praktisi bisa berbeda pendapat pada grafik yang sama. Keduanya mencetak kejadian
berikut tanggal dan angkanya supaya bisa dicek ulang, keyakinan Wyckoff dibatasi
maksimal `sedang` kecuali seluruh syarat sejalan, dan sekali lagi: keduanya tidak
ikut memeringkat.

## Terbit otomatis ke analisa-saham.mhamzah.id

cron menjalankan scan per pasar lalu menyalin halaman screenernya ke situs statis
yang disajikan nginx:

| Alamat | Isi |
|---|---|
| `/` | Halaman depan (`deploy/web/index.html`) dengan tanggal data tiap pasar |
| `/idx/` | Screener IDX terbaru |
| `/crypto/` | Screener crypto terbaru |
| `/hasil/` | Rekam jejak: pilihan yang kena target, kena cut loss, dan masih terbuka |

Jadwal dan opsi scan ada di `deploy/jadwal.conf` (format cron, jam WIB). Bawaannya
IDX Selasa–Sabtu 05:00 — data penutupan hari bursa sebelumnya, jadi Jumat tetap
tayang sepanjang akhir pekan — crypto tiap hari 21:00, dan penilaian hasil tiap
hari 18:00. Setelah mengubahnya:

```bash
deploy/pasang-cron.sh           # tulis ulang blok analisa-saham di crontab
deploy/terbit.sh idx            # terbitkan sekarang juga, tanpa menunggu jadwal
```

- `deploy/terbit.sh` mengganti terbitan secara atomik: `/idx` dan `/crypto` adalah
  symlink ke `rilis/<pasar>-<waktu>/`, dua rilis terakhir disimpan. Kalau halaman
  tidak tertulis atau semua emiten gagal diambil, terbitan lama tetap tayang.
  Sebagian emiten gagal itu biasa dan tetap diterbitkan.
- Log run ada di `logs/terbit-<pasar>.log`.
- Konfigurasi nginx: `deploy/nginx/analisa-saham.mhamzah.id.conf` (HTTPS lewat certbot).
- Folder `report/` tetap terisi tiap run dan tidak dibersihkan otomatis. Berkas
  `pilihan-<TANGGAL>.json` di dalamnya adalah sumber rekam jejak — **jangan dihapus**.

### Rekam jejak (`src/hasil.ts`)

Tiap run scan watchlist penuh yang final (bukan DRAFT) menulis
`report/[crypto/]pilihan-<TANGGAL>.json`: emiten yang lolos gerbang beserta
entry/stop/target utuh (CSV membulatkannya, dan untuk koin seharga $0,0003 itu
berarti nol). Scan beberapa kode saja tidak menulisnya, supaya catatan hari itu
tidak tertimpa.

`bun run src/hasil.ts` membaca semua berkas itu, mengambil bar terbaru, lalu menulis
`report/hasil-<TANGGAL>/index.html` dan `hasil.json`. Aturannya:

- Satu pilihan per emiten, dibuka pada close hari scan. Selama masih terbuka,
  emiten itu tidak dihitung lagi walau lolos lagi.
- **Cut loss** = stop analisa yang dijepit ke 5–10% di bawah entry.
- High menyentuh target → **kena target**. Low menyentuh cut loss → **kena cut
  loss**. Keduanya di hari yang sama dihitung cut loss; gap turun melewati cut loss
  keluar di harga buka. Bar hari scan sendiri tidak dihitung.
- Yang masih terbuka dinilai dari close terakhir. **Benar** = harganya naik dari
  entry. Pilihan yang belum melewati satu hari bursa pun tidak ikut persentase.
- Tidak ada status yang disimpan: semuanya dinilai ulang dari bar tiap run, jadi
  run yang terlewat atau diulang tidak menggeser hasil.

## Uji ulang (`src/replay.ts`)

Jalankan analisa scan yang sama persis pada tanggal-tanggal di masa lalu — hanya
dengan bar sampai tanggal itu — lalu lihat apa yang terjadi sesudahnya. Jawabannya:
kolom scan mana yang benar-benar membedakan emiten yang naik dari yang tidak.

```bash
bun run src/replay.ts                       # IDX, 2 tahun ke belakang, sampel tiap 5 bar
bun run src/replay.ts --market crypto
bun run src/replay.ts --tahun 1 --langkah 10 --horizon 60 BBCA BBRI
```

Keluaran di `report/replay/`: `<pasar>-<TANGGAL>.md` (peringkat kolom, kondisi
dengan peluang naik tertinggi, rincian per kelompok) dan `-sampel.csv` (satu baris
per emiten per tanggal sampel). Bar disimpan di `raw/` dan dipakai ulang selama
12 jam, jadi run kedua di hari yang sama hanya butuh waktu analisa.

- **Naik** = close `--horizon` bar (bawaan 20) sesudah tanggal sampel lebih tinggi.
- **Kena target dulu** = aturan yang sama dengan `/hasil/` (target vs cut loss 5–10%).
- **Kombinasi**: beberapa kondisi gabungan (tren penuh, volatilitas tenang,
  pullback, plus pembanding terburuk), dipisah per paruh waktu — kondisi yang
  unggul hanya di satu paruh kemungkinan kebetulan.
- **Varian target**: tiap rencana dinilai dengan target analisa, target maks +15%,
  dan maks +10%; cut loss sama. Menguji apakah target yang lebih dekat menolong.
- Angka kontinu dikelompokkan per kuantil (Q1 terendah); kelompok di bawah 100
  sampel ditandai _sedikit_ dan tidak ikut peringkat.
- **Batasan:** watchlist hari ini (emiten delisting tidak ada → hasil cenderung
  terlalu bagus), sampel tumpang tindih, tanpa lapisan IDX.

## Struktur

| Berkas | Tanggung jawab |
|---|---|
| `src/yahoo.ts` | Ambil bar harian, buang bar null, cache mentah |
| `src/indicators.ts` | Murni: MA dan profil volume |
| `src/chart.ts` | Hitung MA atas seluruh riwayat, potong ke jendela tampil |
| `src/render.ts` | Susun SVG tema gelap |
| `src/png.ts` | Tangkap SVG jadi PNG lewat Chrome headless |
| `src/cli.ts` | Baca watchlist, ulang per kode, satu browser per run |
| `src/analysis/` | 11 modul metrik, seluruhnya murni |
| `src/idx.ts` | Lapisan pengaya IDX — tidak pernah melempar |
| `src/output/` | Tabel, CSV, Excel, JSON, dan halaman screener HTML dari satu definisi kolom |
| `src/scan.ts` | CLI scan |
| `src/hasil/nilai.ts` | Murni: cut loss, penilaian pilihan, ringkasan rekam jejak |
| `src/hasil.ts` | CLI rekam jejak |
| `src/replay/stats.ts` | Murni: sampel, return maju, kelompok kuantil, peringkat kolom, kombinasi, varian target |
| `src/replay.ts` | CLI uji ulang |

`indicators.ts`, `chart.ts`, dan `render.ts` tidak menyentuh jaringan maupun berkas.

```bash
bun test        # 438 test
bun run typecheck
```

Desain lengkap beserta temuan verifikasinya:

- [Pengunduh grafik](docs/superpowers/specs/2026-09-16-chart-downloader-design.md)
- [Scan analisis 12 metrik](docs/superpowers/specs/2026-09-16-scan-analisis-design.md)

## Prasyarat

Google Chrome terpasang di path standar — dipakai lewat `playwright-core`
(`channel: 'chrome'`), sama seperti `01-app1`, supaya tidak perlu mengunduh browser
terpisah.

## NEXT: Analisa Cashflow
| Arus Kas | Karakteristik & Kondisi | Status |
| --- | --- | --- |
| **Operating Cash Flow (CFO)** |  |  |
| **Investing Cash Flow (CFI)** |  |  |
| **Financing Cash Flow (CFF)** |  |  |
| **Kesehatan Free Cash Flow (FCF)** |  |  | 
| **Struktur Pendanaan & Risiko Utang (CFF & Solvabilitas)** |  |  | 
| **Uji Ketahanan Terhadap Faktor Eksternal (Stress Test)** |  |  | 