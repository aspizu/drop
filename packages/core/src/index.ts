export type Metadata = Record<string, unknown>

export type CreateShareRequest = {
  expiry: number
  anyone_can_write?: boolean
  metadata?: Metadata
}

export type CreateShareResponse = {
  id: string
  passwd: string
}

export type CreateBlobRequest = {
  size: number
  passwd?: string
  metadata?: Metadata
}

export type CreateBlobResponse = {
  id: string
  presignedURL: string
}

export type ShareBlob = {
  id: string
  size: number
  is_uploaded: boolean
  metadata: Metadata
  presignedURL: string
}

export type Share = {
  id: string
  expires_at: string
  anyone_can_write: boolean
  metadata: Metadata
  blobs: ShareBlob[]
}

export type UpdateShareRequest = {
  passwd?: string
  metadata?: Metadata
}

export type UpdateBlobRequest = {
  passwd?: string
  metadata?: Metadata
}

export type AuthenticatedBlobRequest = {
  passwd?: string
}

export type ErrorResponse = {
  message: string
}

export type DropClientOptions = {
  baseURL?: string | URL
  fetch?: typeof fetch
  headers?: HeadersInit
}

export class DropAPIError extends Error {
  readonly status: number
  readonly response: Response
  readonly body: unknown
  readonly cfRayId: string | null

  constructor(response: Response, body: unknown) {
    super(getErrorMessage(response, body))
    this.name = "DropAPIError"
    this.status = response.status
    this.response = response
    this.body = body
    this.cfRayId = response.headers.get("cf-ray")
  }
}

type RequestOptions = {
  method: string
  path: string
  body?: unknown
}

export class DropClient {
  readonly baseURL: string
  readonly fetcher: typeof fetch
  readonly headers?: HeadersInit

  constructor(options: DropClientOptions = {}) {
    this.baseURL = String(options.baseURL ?? "")
    this.fetcher = options.fetch ?? fetch
    this.headers = options.headers
  }

  createShare(body: CreateShareRequest) {
    return this.request<CreateShareResponse>({
      method: "POST",
      path: "/share",
      body,
    })
  }

  createBlob(shareID: string, body: CreateBlobRequest) {
    return this.request<CreateBlobResponse>({
      method: "POST",
      path: `/share/${shareID}/blob`,
      body,
    })
  }

  getShare(shareID: string) {
    return this.request<Share>({
      method: "GET",
      path: `/share/${shareID}`,
    })
  }

  updateShare(shareID: string, body: UpdateShareRequest) {
    return this.request<void>({
      method: "PATCH",
      path: `/share/${shareID}`,
      body,
    })
  }

  updateBlob(shareID: string, blobID: string, body: UpdateBlobRequest) {
    return this.request<void>({
      method: "PATCH",
      path: `/share/${shareID}/blob/${blobID}`,
      body,
    })
  }

  markBlobUploaded(shareID: string, blobID: string, body: AuthenticatedBlobRequest = {}) {
    return this.request<void>({
      method: "POST",
      path: `/share/${shareID}/blob/${blobID}/uploaded`,
      body,
    })
  }

  deleteBlob(shareID: string, blobID: string, body: AuthenticatedBlobRequest = {}) {
    return this.request<void>({
      method: "DELETE",
      path: `/share/${shareID}/blob/${blobID}`,
      body,
    })
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const response = await this.fetcher(`${this.baseURL}${options.path}`, {
      method: options.method,
      headers: buildHeaders(this.headers, options.body !== undefined),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    const body = JSON.parse(await response.text()) as unknown
    if (!response.ok) {
      throw new DropAPIError(response, body)
    }
    return body as T
  }
}

function getErrorMessage(response: Response, body: unknown) {
  if (isErrorBody(body)) {
    return body.message
  }
  if (typeof body === "string" && body.length > 0) {
    return body
  }
  return `Drop API request failed with ${response.status}`
}

function isErrorBody(body: unknown): body is ErrorResponse {
  return (
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
  )
}

function buildHeaders(headers: HeadersInit | undefined, hasBody: boolean) {
  const result = new Headers(headers)
  if (hasBody && !result.has("Content-Type")) {
    result.set("Content-Type", "application/json")
  }
  return result
}
