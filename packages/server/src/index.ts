import {zValidator} from "@hono/zod-validator"
import {HTTPException} from "hono/http-exception"
import {v7} from "uuid"
import z from "zod"

import ratelimit from "./middleware/ratelimit"
import hono from "./utils/hono"
import {generateRandomID} from "./utils/id"
import {makeS3} from "./utils/s3"
import sql from "./utils/sql"

/** 24 hours */
const MAX_EXPIRY = 1000 * 60 * 60 * 24
/** 500 MB */
const MAX_SHARE_TOTAL_SIZE = 1000 * 1000 * 500
/** 16 KB */
const MAX_METADATA_SIZE = 1000 * 16
const metadataSchema = z.record(z.string(), z.unknown()).default({})

function stringifyMetadata(metadata: Record<string, unknown>) {
  const stringified = JSON.stringify(metadata)
  if (new TextEncoder().encode(stringified).byteLength > MAX_METADATA_SIZE) {
    throw new HTTPException(400, {message: "Metadata is too large"})
  }
  return stringified
}

function parseMetadata(metadata: unknown) {
  if (typeof metadata !== "string") {
    return {}
  }
  return JSON.parse(metadata) as Record<string, unknown>
}

function dbBoolean(value: unknown) {
  return value === true || value === 1
}

export default hono()
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({message: err.message}, err.status)
    }
    if (err instanceof Error) {
      console.error(err)
      return c.json({message: "Internal Server Error"}, 500)
    }
    console.error(err)
    return c.json({message: "Internal Server Error"}, 500)
  })
  .use("/*", ratelimit)
  .post(
    "/share",
    zValidator(
      "json",
      z.object({
        expiry: z.number().min(0).max(MAX_EXPIRY),
        anyone_can_write: z.boolean().default(false),
        metadata: metadataSchema,
      }),
    ),
    async (c) => {
      const {anyone_can_write, expiry, metadata} = c.req.valid("json")
      const id = generateRandomID()
      const passwd = v7()
      const stringifiedMetadata = stringifyMetadata(metadata)
      await sql(c)`
        INSERT INTO share (id, expires_at, passwd, metadata, anyone_can_write) VALUES (${id}, ${new Date(Date.now() + expiry)}, ${passwd}, ${stringifiedMetadata}, ${anyone_can_write})
      `.run()
      return c.json({
        id,
        passwd,
      })
    },
  )
  .post(
    "/share/:shareID/blob",
    zValidator(
      "json",
      z.object({
        size: z.number().min(0),
        passwd: z.string().min(1).optional(),
        metadata: metadataSchema,
      }),
    ),
    async (c) => {
      const {shareID} = c.req.param()
      const id = v7()
      const {size, passwd, metadata} = c.req.valid("json")
      const row = await sql(c)`
        SELECT * FROM share WHERE id = ${shareID} AND (anyone_can_write OR passwd = ${passwd})
      `.first()
      if (row === null) {
        throw new HTTPException(404, {message: "Share not found"})
      }
      const stringifiedMetadata = stringifyMetadata(metadata)
      const insert = await sql(c)`
        INSERT INTO blob (id, bsize, share_id, metadata)
        SELECT ${id}, ${size}, ${shareID}, ${stringifiedMetadata}
        WHERE (
          SELECT COALESCE(SUM(bsize), 0) FROM blob WHERE share_id = ${shareID}
        ) + ${size} <= ${MAX_SHARE_TOTAL_SIZE}
      `.run()
      if (insert.meta.changes === 0) {
        throw new HTTPException(400, {message: "Share is full"})
      }
      const s3 = makeS3(c.env)
      return c.json({
        id,
        presignedURL: await s3.getPresignedUrl(
          "PUT",
          id,
          60 * 60 * 24,
          {},
          {"Content-Length": size.toString(10)},
        ),
      })
    },
  )
  .get("/share/:shareID", async (c) => {
    const {shareID} = c.req.param()
    const share = await sql(c)`
      SELECT id, expires_at, metadata, anyone_can_write FROM share WHERE id = ${shareID}
    `.first()
    if (share === null) {
      throw new HTTPException(404, {message: "Share not found"})
    }
    const {results: blobs} = await sql(c)`
      SELECT id, bsize, is_uploaded, metadata FROM blob WHERE share_id = ${shareID}
    `.all()
    const s3 = makeS3(c.env)
    return c.json({
      id: share.id,
      expires_at: share.expires_at,
      anyone_can_write: dbBoolean(share.anyone_can_write),
      metadata: parseMetadata(share.metadata),
      blobs: await Promise.all(
        blobs.map(async (blob) => ({
          id: blob.id,
          size: blob.bsize,
          is_uploaded: dbBoolean(blob.is_uploaded),
          metadata: parseMetadata(blob.metadata),
          presignedURL: await s3.getPresignedUrl("GET", String(blob.id), 60 * 60 * 24),
        })),
      ),
    })
  })
  .patch(
    "/share/:shareID",
    zValidator(
      "json",
      z.object({
        passwd: z.string().min(1).optional(),
        metadata: metadataSchema,
      }),
    ),
    async (c) => {
      const {shareID} = c.req.param()
      const {passwd, metadata} = c.req.valid("json")
      const stringifiedMetadata = stringifyMetadata(metadata)
      const row = await sql(c)`
        SELECT * FROM share WHERE id = ${shareID} AND (anyone_can_write OR passwd = ${passwd})
      `.first()
      if (row === null) {
        throw new HTTPException(404, {message: "Share not found"})
      }
      await sql(c)`
        UPDATE share SET metadata = ${stringifiedMetadata} WHERE id = ${shareID}
      `.run()
      return c.json(null)
    },
  )
  .patch(
    "/share/:shareID/blob/:blobID",
    zValidator(
      "json",
      z.object({
        passwd: z.string().min(1).optional(),
        metadata: metadataSchema,
      }),
    ),
    async (c) => {
      const {blobID, shareID} = c.req.param()
      const {passwd, metadata} = c.req.valid("json")
      const stringifiedMetadata = stringifyMetadata(metadata)
      const row = await sql(c)`
        SELECT blob.* FROM blob
        INNER JOIN share ON share.id = blob.share_id
        WHERE blob.share_id = ${shareID} AND blob.id = ${blobID} AND (share.anyone_can_write OR share.passwd = ${passwd})
      `.first()
      if (row === null) {
        throw new HTTPException(404, {message: "Blob or share not found"})
      }
      await sql(c)`
        UPDATE blob SET metadata = ${stringifiedMetadata} WHERE id = ${blobID} AND share_id = ${shareID}
      `.run()
      return c.json(null)
    },
  )
  .post(
    "/share/:shareID/blob/:blobID/uploaded",
    zValidator(
      "json",
      z.object({
        passwd: z.string().min(1).optional(),
      }),
    ),
    async (c) => {
      const {blobID, shareID} = c.req.param()
      const {passwd} = c.req.valid("json")
      const row = await sql(c)`
        SELECT blob.bsize FROM blob
        INNER JOIN share ON share.id = blob.share_id
        WHERE blob.share_id = ${shareID} AND blob.id = ${blobID} AND (share.anyone_can_write OR share.passwd = ${passwd})
      `.first()
      if (row === null) {
        throw new HTTPException(404, {message: "Blob or share not found"})
      }
      const s3 = makeS3(c.env)
      if ((await s3.objectExists(blobID)) !== true) {
        throw new HTTPException(400, {message: "Blob was not uploaded"})
      }
      await sql(c)`
        UPDATE blob SET is_uploaded = true WHERE id = ${blobID} AND share_id = ${shareID}
      `.run()
      return c.json(null)
    },
  )
  .delete(
    "/share/:shareID/blob/:blobID",
    zValidator(
      "json",
      z.object({
        passwd: z.string().min(1).optional(),
      }),
    ),
    async (c) => {
      const {blobID, shareID} = c.req.param()
      const {passwd} = c.req.valid("json")
      const row = await sql(c)`
      SELECT blob.* FROM blob
      INNER JOIN share ON share.id = blob.share_id
      WHERE blob.share_id = ${shareID} AND blob.id = ${blobID} AND (share.anyone_can_write OR share.passwd = ${passwd})
    `.first()
      if (row === null) {
        throw new HTTPException(404, {message: "Blob or share not found"})
      }
      await sql(c)`
      DELETE FROM blob WHERE id = ${blobID} AND share_id = ${shareID}
    `.run()
      return c.json(null)
    },
  )
