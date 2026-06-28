const URL_SAFE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

export function generateRandomID() {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((byte) => URL_SAFE_CHARS[byte % URL_SAFE_CHARS.length])
    .join("")
}
