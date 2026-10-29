# FLASH QUEST

Game flashcard untuk belajar ujian. Soal diimpor dari Excel, lalu dimainkan sendirian (solo) atau beramai-ramai lewat ruangan multiplayer (host + pemain) tanpa server sendiri.

- Tanpa build, tanpa instalasi: cukup `index.html`, `style.css`, `app.js`, dan folder `sounds/`.
- Multiplayer memakai PeerJS (WebRTC peer-to-peer), jadi tidak ada backend yang perlu kamu urus.
- Semua data (soal, pengaturan, nama) tersimpan di `localStorage` browser masing-masing.

---

## Isi folder

```
flashquest/
├── index.html
├── style.css
├── app.js
├── README.md
└── sounds/
```

Folder `sounds/` harus berada di samping `index.html`. Kalau ada file suara yang hilang, game tetap jalan dan memakai bunyi beep bawaan sebagai pengganti.

---

## Menjalankan di lokal

Game membutuhkan **internet** karena tiga library (PeerJS, SheetJS, QRCode) dan font dimuat dari CDN, dan multiplayer memakai server sinyal PeerJS publik.

### Cara 1: buka langsung (paling cepat, cukup untuk mode solo)

Klik dua kali `index.html`. Mode **Main Sendiri** langsung bisa dipakai. Mode host tetap bisa dibuka, tapi pemain lain tidak akan bisa membuka link-nya karena alamatnya berupa `file://` (game akan menampilkan peringatan kuning di lobi).

### Cara 2: server lokal (disarankan, wajib kalau mau multiplayer di jaringan yang sama)

Jalankan salah satu perintah di dalam folder `flashquest/`:

```bash
# Python 3
python3 -m http.server 8000

# atau Node.js
npx serve -l 8000
```

Lalu buka `http://localhost:8000`.

### Multiplayer lewat Wi-Fi yang sama

1. Cari alamat IP laptop host: Windows `ipconfig`, macOS/Linux `ifconfig` atau `ip a` (contoh `192.168.1.20`).
2. **Host membuka game lewat alamat IP itu**, bukan `localhost`: `http://192.168.1.20:8000`. Alasannya, link dan QR di lobi dibuat dari alamat yang sedang dipakai host. Kalau host membuka `localhost`, HP pemain tidak bisa menjangkau link tersebut.
3. Pemain membuka alamat yang sama dari HP, atau scan QR di lobi.
4. Kalau HP tidak bisa membuka halaman, cek firewall laptop dan pastikan Wi-Fi tidak memakai mode "client isolation" (sering aktif di Wi-Fi publik atau kampus).

Catatan: server lokal lewat IP memakai `http`, bukan `https`. Akibatnya tombol salin ke clipboard memakai cara cadangan dan fitur layar-tetap-menyala (wake lock) tidak aktif di sisi host. Keduanya tidak memengaruhi jalannya game.

### Multiplayer lewat internet (pemain di mana saja)

Upload semua file (termasuk folder `sounds/`) ke hosting statis, misalnya Netlify Drop, GitHub Pages, atau Cloudflare Pages. Host dan pemain membuka alamat `https` yang sama. Cara ini paling stabil karena berjalan di `https`.

---

## Format file soal (Excel)

Klik **UNDUH TEMPLATE EXCEL** di beranda untuk mendapat file contoh dan lembar petunjuk. Sheet bernama `Soal` dibaca lebih dulu, kalau tidak ada maka sheet pertama. Format `.xlsx`, `.xls`, dan `.csv` diterima.

| Kolom                    | Wajib                  | Isi                                                                                                                       |
| ------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Tipe`                   | tidak                  | `single` (1 jawaban benar), `multi` (2+ jawaban benar), `tf` (benar/salah). Kalau kosong, tipe ditebak dari kolom Jawaban |
| `Soal`                   | ya                     | Teks pertanyaan. Alt+Enter untuk baris baru                                                                               |
| `Opsi A` sampai `Opsi F` | untuk single dan multi | Minimal 2 opsi terisi. Kosongkan untuk `tf`. Opsi kosong dilewati                                                         |
| `Jawaban`                | ya                     | single: satu huruf (`B`). multi: beberapa huruf (`A,C`). tf: `BENAR` atau `SALAH`                                         |
| `Waktu (detik)`          | tidak                  | 5 sampai 300. Kalau diisi, mengalahkan waktu default di pengaturan                                                        |
| `Penjelasan`             | tidak                  | Ditampilkan setelah soal dijawab                                                                                          |

Baris yang bermasalah dilewati dan dilaporkan di layar impor (nomor baris beserta alasannya). Soal yang valid tetap dimasukkan.

Soal terakhir yang berhasil diimpor tersimpan otomatis di browser, jadi tidak perlu impor ulang. Klik **HAPUS SOAL TERSIMPAN** untuk menghapusnya.

---

## Pengaturan (mode solo dan host)

| Pengaturan          | Fungsi                                                    |
| ------------------- | --------------------------------------------------------- |
| Acak urutan soal    | Urutan soal diacak tiap permainan                         |
| Acak urutan pilihan | Posisi opsi A–F diacak (soal benar/salah tidak diacak)    |
| Pakai timer         | Hanya mode solo. Host selalu memakai timer                |
| Waktu per soal      | Default 20 detik, rentang 5–300                           |
| Jumlah soal         | `0` berarti semua soal. Angka lain mengambil sejumlah itu |

Pengaturan tersimpan otomatis.

---

## Aturan skor

- Jawaban benar bernilai **1000 poin** kalau instan, turun linear sampai **500 poin** di detik terakhir.
- Jawaban salah atau tidak menjawab bernilai **0**.
- Soal `multi` harus **persis sama** dengan kunci: semua opsi benar terpilih dan tidak ada opsi salah.
- Solo tanpa timer: setiap jawaban benar bernilai flat 1000 poin.
- **Streak** adalah jumlah jawaban benar berturut-turut. Salah atau tidak menjawab mengembalikan streak ke 0.
- Urutan peringkat multiplayer: skor tertinggi, lalu total waktu menjawab tersingkat, lalu yang bergabung lebih dulu.

---

## Mode 1: Main Sendiri

1. Di beranda pilih **MAIN SENDIRI**.
2. Impor file soal (atau pakai soal tersimpan), atur pengaturan, lalu klik **MULAI**.
3. Pilih jawaban.
   - `single` dan `tf`: begitu dipilih, jawaban langsung dikunci.
   - `multi`: pilih semua opsi yang benar, lalu klik **KUNCI JAWABAN**.
4. Panel umpan balik menampilkan jawabanmu, jawaban benar, poin, dan penjelasan. Klik **LANJUT**.
5. Di akhir ada ringkasan (benar, akurasi, rata-rata waktu, streak terbaik) dan **riwayat soal dan jawaban** lengkap dengan filter SEMUA / BENAR / SALAH.

Tombol di halaman hasil:

- **MAIN LAGI**: ulang dengan soal yang sama (urutan diacak ulang sesuai pengaturan).
- **ULANGI YANG SALAH**: main hanya dengan soal yang tadi salah atau tidak dijawab.
- **GANTI SOAL**: kembali ke halaman setup.

Pintasan keyboard:

| Tombol               | Fungsi                                                   |
| -------------------- | -------------------------------------------------------- |
| `A`–`F` atau `1`–`6` | Pilih opsi                                               |
| `1` / `T` / `B`      | Soal benar/salah: pilih BENAR                            |
| `2` / `F` / `S`      | Soal benar/salah: pilih SALAH                            |
| `Enter`              | Kunci jawaban (soal multi), atau lanjut setelah menjawab |
| `Spasi`              | Lanjut setelah menjawab                                  |

---

## Mode 2: Jadi Host

Host adalah pengendali ruangan dan **tidak ikut bermain**. Cocok dibuka di laptop atau proyektor.

1. Di beranda pilih **JADI HOST**, impor soal, atur pengaturan, lalu klik **BUAT RUANGAN**.
2. Muncul **kode ruangan 5 karakter**, link, dan QR. Bagikan salah satunya ke pemain (tombol SALIN KODE dan SALIN LINK tersedia).
3. Di lobi, daftar pemain yang masuk tampil secara langsung. Tombol **✕** di samping nama mengeluarkan pemain. Tombol **MULAI GAME** aktif kalau minimal satu pemain terhubung.
4. Saat soal tampil:
   - Layar host menampilkan soal, opsi, timer, dan jumlah yang sudah menjawab.
   - Soal otomatis ditutup kalau semua pemain online sudah menjawab, atau saat waktu habis.
   - **LEWATI WAKTU** menutup soal lebih awal.
5. Setelah soal ditutup (fase reveal): kunci jawaban, jumlah pemilih tiap opsi, penjelasan, dan papan peringkat sementara tampil. Klik **NEXT** untuk soal berikutnya.
6. Di akhir ada podium, leaderboard, dan tiga tombol:
   - **UNDUH HASIL (.XLSX)**: peringkat, nama, skor, jumlah benar, dan total waktu.
   - **MAIN LAGI (PEMAIN SAMA)**: kembali ke lobi dengan skor direset, pemain yang masih terhubung tetap di ruangan.
   - **TUTUP RUANGAN**: semua pemain dikeluarkan.

Tips: biarkan tab host tetap terbuka dan di depan. Kalau host menutup tab, ruangan hilang.

---

## Mode 3: Gabung

1. Di beranda pilih **GABUNG**, atau scan QR dari host (kode ruangan terisi otomatis).
2. Isi **kode ruangan** (5 karakter) dan **nama** (maksimal 16 karakter, tidak boleh sama dengan pemain lain), lalu klik **GABUNG**.
3. Tunggu host memulai. Saat soal tampil, pilih jawabanmu seperti di mode solo.
4. Setelah tiap soal, kamu melihat hasil, poin, penjelasan, posisimu, selisih poin dengan peringkat di atasmu, dan papan peringkat teratas.
5. Di akhir kamu melihat peringkat akhir. Tunggu host kalau ingin main lagi.

Koneksi putus? Game mencoba menyambung ulang otomatis sampai 10 kali. Selama nama dan perangkat sama, skormu tetap aman dan kamu langsung masuk lagi ke soal yang sedang berjalan.

---

## Suara

Dua tombol di pojok kanan atas mengatur suara dan tersimpan di browser:

- **SFX**: efek suara.
- **MUSIK**: musik latar. Musik baru mulai setelah kamu menyentuh layar sekali (aturan autoplay browser).

Tabel file suara (format `.mp3`):

| File          | Dimainkan saat                                                 |
| ------------- | -------------------------------------------------------------- |
| `sfx_click`   | Memilih opsi, tombol filter riwayat                            |
| `sfx_benar`   | Jawaban benar                                                  |
| `sfx_salah`   | Jawaban salah                                                  |
| `sfx_timeout` | Waktu habis atau tidak menjawab                                |
| `sfx_start`   | Soal baru tampil                                               |
| `sfx_lock`    | Menekan KUNCI JAWABAN                                          |
| `sfx_tick`    | Tiap detik di 5 detik terakhir                                 |
| `sfx_streak`  | Streak 3 benar atau lebih                                      |
| `sfx_join`    | Pemain masuk lobi (di sisi host)                               |
| `sfx_reveal`  | Host membuka kunci jawaban                                     |
| `sfx_win`     | Hasil bagus (akurasi 75% ke atas, atau 3 besar di multiplayer) |
| `sfx_lose`    | Hasil rendah (akurasi di bawah 50%, solo)                      |
| `bgm_menu`    | Latar menu, setup, dan lobi                                    |
| `bgm_game`    | Latar saat soal berlangsung                                    |

Mengganti suara: timpa file dengan nama yang sama. Kalau memakai format lain (`.wav` atau `.ogg`), ubah konstanta `SOUND_EXT` di `app.js`.

---

## Pemecahan masalah

| Masalah                                     | Penyebab dan solusi                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| "Library Excel belum termuat"               | Tidak ada internet saat halaman dibuka. Sambungkan internet lalu muat ulang                                                   |
| "Library multiplayer gagal dimuat"          | PeerJS gagal diunduh. Cek internet atau pemblokir iklan lalu muat ulang                                                       |
| "Ruangan tidak ditemukan"                   | Kode salah, atau host sudah menutup ruangan. Minta host membuat ulang                                                         |
| "Tidak bisa terhubung ke host"              | Jaringan memblokir WebRTC. Coba jaringan lain, atau pindahkan salah satu pihak ke data seluler                                |
| Link atau QR tidak bisa dibuka di HP pemain | Host membuka lewat `file://` atau `localhost`. Buka lewat alamat IP laptop atau hosting statis                                |
| Nama ditolak                                | Nama sudah dipakai pemain lain di ruangan itu                                                                                 |
| Tidak ada musik                             | Sentuh layar sekali, cek tombol MUSIK, dan pastikan folder `sounds/` ada di samping `index.html`                              |
| Soal hasil impor ada yang hilang            | Lihat daftar "Baris dilewati / error" di halaman setup, biasanya kolom Jawaban kosong atau huruf jawaban menunjuk opsi kosong |

---

## Catatan teknis singkat

- `app.js` terdiri dari dua bagian: **Core** (parsing Excel, skor, acak, bisa dites di Node lewat `require("./app.js")`) dan **UI** (solo, host, pemain).
- Kunci `localStorage` yang dipakai: `fq_deck`, `fq_cfg`, `fq_name`, `fq_mute`, `fq_music`, dan `fq_pid_<kode>`.
- Prefix ID PeerJS: `flashquest-v1-<KODE>`.
