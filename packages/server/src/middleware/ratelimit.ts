import {HTTPException} from "hono/http-exception"

import type {Context} from "../utils/hono"

export default async function ratelimit(c: Context, next: () => Promise<void>) {
  const {success} = await c.env.RATELIMIT.limit({
    key: JSON.stringify({
      ip: c.req.header("cf-connecting-ip"),
      path: c.req.path,
    }),
  })
  if (!success) {
    throw new HTTPException(429, {message: "Too many requests"})
  }
  await next()
}
