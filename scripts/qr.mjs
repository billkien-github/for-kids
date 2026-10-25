// In mã QR của một URL ra terminal để quét bằng iPad.
// Dùng: node scripts/qr.mjs <url>
import QRCode from 'qrcode'

const url = process.argv[2]
if (!url) {
  console.error('Dùng: node scripts/qr.mjs <url>')
  process.exit(1)
}
console.log(await QRCode.toString(url, { type: 'terminal', small: true }))
