import fs from 'node:fs/promises'
import path from 'node:path'

/** Lớp trung gian lưu file (§10): bản đầu ghi ra ổ đĩa, sau này thêm S3Storage. */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>
  get(key: string): Promise<Buffer | null>
  delete(key: string): Promise<void>
}

export class LocalDiskStorage implements Storage {
  constructor(private readonly root: string) {}

  private file(key: string) {
    // key do server tự sinh (sha256), nhưng vẫn chặn thoát ra ngoài thư mục gốc.
    const p = path.resolve(this.root, key)
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error(`storage key không hợp lệ: ${key}`)
    return p
  }

  async put(key: string, data: Buffer) {
    const p = this.file(key)
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, data)
  }

  async get(key: string) {
    try {
      return await fs.readFile(this.file(key))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  async delete(key: string) {
    await fs.rm(this.file(key), { force: true })
  }
}

/** Dùng trong test. */
export class MemoryStorage implements Storage {
  readonly files = new Map<string, Buffer>()
  async put(key: string, data: Buffer) {
    this.files.set(key, data)
  }
  async get(key: string) {
    return this.files.get(key) ?? null
  }
  async delete(key: string) {
    this.files.delete(key)
  }
}
