# 🇮🇩 API Hari Libur Indonesia

API gratis dan cepat untuk mendapatkan data hari libur nasional serta cuti bersama di Indonesia. Dibangun menggunakan **Node.js**, **TypeScript**, **Hono**, dan arsitektur **Multi-Source Aggregator** (bersumber dari [tanggalans.com](https://www.tanggalans.com/) & [husniadil.com](https://husniadil.com/)), siap dideploy ke **Vercel Serverless Functions**.

---

## 🚀 Fitur Utama

- ⚡ **Super Cepat & Ringan:** Ditenagai oleh Hono framework dengan in-memory cache dan Vercel Edge CDN headers (`Cache-Control`).
- 🔄 **Multi-Source Scraper:** Mengagregasi data dari berbagai sumber tepercaya secara paralel dengan penanganan fallback otomatis.
- 🎯 **Akurat & Tervalidasi:** Validasi input ketat dengan Zod dan penyesuaian zona waktu `Asia/Jakarta` (WIB, UTC+7).
- 🧩 **100% Backward Compatible:** Mempertahankan kontrak API lama yang stabil dan ramah integrasi.
- ☁️ **Vercel Serverless Ready:** Dilengkapi adapter serverless dan antarmuka web dokumentasi statis bawaan.

---

## 📋 Endpoints

| Endpoint | Method | Deskripsi |
| :--- | :---: | :--- |
| `/api` | `GET` | Daftar hari libur pada tahun berjalan (WIB) |
| `/api?year=2026` | `GET` | Daftar hari libur pada tahun tertentu (2011 – tahun depan) |
| `/api?year=2026&month=1` | `GET` | Daftar hari libur pada bulan tertentu |
| `/api?year=2026&month=1&day=1` | `GET` | Detail status libur pada tanggal tertentu |
| `/api/today` | `GET` | Status dan daftar hari libur hari ini (WIB) |
| `/api/tomorrow` | `GET` | Status dan daftar hari libur besok (WIB) |

### Contoh Respons

#### 1. List Hari Libur (`GET /api?year=2026&month=1`)
```json
[
  {
    "name": "Tahun Baru 2026 Masehi",
    "date": "2026-01-01",
    "is_national_holiday": true
  },
  {
    "name": "Isra Mi'raj Nabi Muhammad SAW",
    "date": "2026-01-16",
    "is_national_holiday": true
  }
]
```

#### 2. Detail Tanggal (`GET /api/today` atau `GET /api?year=2026&month=1&day=1`)
```json
{
  "date": "2026-01-01",
  "is_holiday": true,
  "is_national_holiday": true,
  "holiday_list": [
    "Tahun Baru 2026 Masehi"
  ]
}
```

---

## 💻 Panduan Penggunaan Lokal

### Prasyarat
- [Node.js](https://nodejs.org/) (versi 18 ke atas disarankan)
- npm / pnpm / yarn

### Langkah Instalasi

1. **Clone repository:**
   ```bash
   git clone https://github.com/afirmansyah26-code/api-hari-libur.git
   cd api-hari-libur
   ```

2. **Install dependensi:**
   ```bash
   npm install
   ```

3. **Jalankan development server:**
   ```bash
   npm run dev
   ```
   Aplikasi dan dokumentasi interaktif akan berjalan di `http://localhost:8000`.

---

## 🧪 Testing & Build

```bash
# Menjalankan unit & regression test suite (Vitest)
npm test

# Menjalankan TypeScript typecheck
npm run typecheck

# Build TypeScript untuk deployment
npm run build
```

---

## ☁️ Deployment ke Vercel

Proyek ini sudah dilengkapi file konfigurasi [vercel.json](vercel.json) dan entry point [api/index.ts](api/index.ts).

1. Hubungkan repository GitHub ini ke akun **Vercel** Anda.
2. Vercel akan secara otomatis mendeteksi konfigurasi dan melakukan build & deploy setiap kali ada `git push` ke branch `main`.

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).

---

## 🙏 Acknowledgments & Kredit

- Proyek ini difork dan dikembangkan dari repositori asli oleh [radyakaze/api-hari-libur](https://github.com/radyakaze/api-hari-libur).
- Data hari libur bersumber dari [tanggalans.com](https://www.tanggalans.com/) dan [husniadil.com](https://husniadil.com/).
