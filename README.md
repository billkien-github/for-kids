# For-Kids

Web app học tập cho các bé, chạy trên iPad qua trình duyệt. Đặc tả: [docs/spec.md](docs/spec.md).

## Cấu trúc

```
apps/api/        Fastify + Drizzle (Postgres), migration ở apps/api/drizzle
apps/web/        React + Vite + Tailwind
packages/shared/ Schema Zod dùng chung (câu hỏi, bài tập), hằng số
```

## Chạy bằng Docker

```sh
cp .env.example .env        # điền mật khẩu, SESSION_SECRET, tài khoản phụ huynh
docker compose up -d --build
docker compose exec app node dist/cli/seed.js   # tạo gia đình, phụ huynh, chủ đề Toán
# Public qua ngrok (cần NGROK_AUTHTOKEN, NGROK_DOMAIN):
docker compose --profile tunnel up -d
```

App mở ở http://localhost:3000. Migration tự chạy mỗi lần app khởi động.

## Phát triển

Cần Node ≥ 22 và pnpm.

```sh
pnpm install
docker compose up -d db     # chỉ chạy Postgres
pnpm db:seed
pnpm dev                    # api :3000, web :5173 (proxy /api sang api)
```

| Lệnh | Việc |
|---|---|
| `pnpm test` | Vitest cho mọi package. Test của api dùng PGlite, không cần Postgres. |
| `pnpm typecheck` | Kiểm tra kiểu cho mọi package |
| `pnpm db:generate` | Sinh migration mới sau khi sửa `apps/api/src/db/schema.ts` |
| `pnpm build` | Build web rồi api |
