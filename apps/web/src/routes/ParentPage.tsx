import { Link } from 'react-router'

// Khung tạm cho khu phụ huynh (§6).
export function ParentPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Khu phụ huynh</h1>
      <p className="mt-2 text-slate-500">Chưa làm. Sẽ có: tổng quan, bài tập, giao bài, quà, hồ sơ các bé, cài đặt.</p>
      <Link to="/" className="mt-6 inline-block text-blue-600 underline">
        ← Về màn chọn profile
      </Link>
    </main>
  )
}
