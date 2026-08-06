export interface DriveFile {
  id: string
  name: string
  mimeType?: string
  size?: string
  modifiedTime?: string
  parents?: string[]
  webViewLink?: string
}

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

function boundary(): string {
  return 'pt_boundary_' + Math.random().toString(36).slice(2)
}

export class DriveClient {
  private token: string

  constructor(token: string) {
    this.token = token
  }

  private async req(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.headers || {}),
      },
    })
    if (!res.ok) {
      let msg = `Drive error ${res.status}`
      try {
        const j = await res.json()
        msg = j?.error?.message || msg
      } catch {
        /* ignore */
      }
      const err = new Error(msg) as Error & { status?: number }
      err.status = res.status
      throw err
    }
    return res
  }

  async list(q: string, fields = 'files(id,name,mimeType,size,modifiedTime,webViewLink)'): Promise<DriveFile[]> {
    const url = `${API}/files?spaces=drive&fields=${encodeURIComponent(fields)}&q=${encodeURIComponent(q)}`
    const res = await this.req(url)
    const j = await res.json()
    return j.files || []
  }

  async get(id: string, fields = 'id,name,mimeType,size,modifiedTime,webViewLink'): Promise<DriveFile> {
    const res = await this.req(`${API}/files/${id}?fields=${encodeURIComponent(fields)}`)
    return res.json()
  }

  async createFolder(name: string, parentId: string, appProps: Record<string, string> = {}): Promise<string> {
    const res = await this.req(`${API}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
        appProperties: appProps,
      }),
    })
    const j = await res.json()
    return j.id as string
  }

  /** Create a file with content (multipart). */
  async createFile(
    parentId: string,
    name: string,
    mimeType: string,
    content: string | Blob,
    appProps: Record<string, string> = {},
  ): Promise<string> {
    const b = boundary()
    const head =
      `--${b}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name, mimeType, parents: [parentId], appProperties: appProps }) +
      `\r\n--${b}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
    const tail = `\r\n--${b}--\r\n`
    const body = new Blob([head, content, tail], { type: `multipart/related; boundary=${b}` })
    const res = await this.req(`${UPLOAD}/files?uploadType=multipart`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${b}` },
      body,
    })
    const j = await res.json()
    return j.id as string
  }

  /** Overwrite existing file content (media). */
  async updateContent(fileId: string, mimeType: string, content: string | Blob): Promise<void> {
    await this.req(`${UPLOAD}/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': mimeType },
      body: content as BodyInit,
    })
  }

  async downloadText(fileId: string): Promise<string> {
    const res = await this.req(`${API}/files/${fileId}?alt=media`)
    return res.text()
  }

  async downloadBlob(fileId: string): Promise<Blob> {
    const res = await this.req(`${API}/files/${fileId}?alt=media`)
    return res.blob()
  }

  /** Share a folder/file with another account (view only). */
  async shareWith(fileId: string, email: string, role: 'reader' | 'writer' = 'reader'): Promise<void> {
    await this.req(`${API}/files/${fileId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, type: 'user', emailAddress: email }),
    })
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.req(`${API}/files/${fileId}`, { method: 'DELETE' })
  }
}
