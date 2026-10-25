import type { WorksheetStatus } from '@for-kids/shared'

// Cách gọi dùng chung trong app, để giữ giọng văn thống nhất:
// - Nói với con: xưng "con", câu ngắn, vui.
// - Nói với bố mẹ: gọi các bé là "các con"/"con", tránh từ kỹ thuật (token, xuất bản, MCP…).

export const WORKSHEET_STATUS: Record<WorksheetStatus, { label: string; tab: string; hint: string }> = {
  draft: { label: 'Đang soạn', tab: 'Đang soạn', hint: 'Con chưa thấy bài này' },
  published: { label: 'Đang mở', tab: 'Đang mở cho con', hint: 'Con thấy trong kho bài và làm được' },
  archived: { label: 'Đã cất', tab: 'Đã cất', hint: 'Ẩn khỏi kho bài, kết quả cũ vẫn giữ' },
}

export const PARENT_AREA = 'Góc bố mẹ'
export const BACK_TO_KIDS = 'Về với các con'
