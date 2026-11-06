import Dexie, { type DBCore } from "dexie";
import { workspaceEncryptionKey } from "./browser";

type Envelope = Record<string, unknown> & {
  sealed: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
  media?: { sealed: ArrayBuffer; iv: Uint8Array<ArrayBuffer> };
};

const utf8 = new TextEncoder();
const decoder = new TextDecoder();

export function protectWorkspaceStorage(db: Dexie) {
  const key = workspaceEncryptionKey();
  if (!key) return; // Existing local workspaces keep their original storage format.

  db.use({
    stack: "dbcore", name: "formatter-account-vault",
    create(down: DBCore): DBCore {
      return {
        ...down,
        table(name) {
          const table = down.table(name);
          const indexes = [table.schema.primaryKey, ...table.schema.indexes].map((index) => index.keyPath);
          if (indexes.some((path) => typeof path !== "string" || path.includes(".")))
            throw new Error("Unsupported encrypted workspace index");
          const fields = indexes as string[];
          const identity = (record: Record<string, unknown>, part: string) =>
            utf8.encode(JSON.stringify([db.name, name, record[fields[0]], part]));
          async function seal(value: BufferSource, aad: Uint8Array<ArrayBuffer>) {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            return { iv, sealed: await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key!, value) };
          }
          const unseal = (value: Pick<Envelope, "sealed" | "iv">, aad: Uint8Array<ArrayBuffer>) =>
            crypto.subtle.decrypt({ name: "AES-GCM", iv: value.iv, additionalData: aad }, key!, value.sealed);
          async function encode(record: Record<string, unknown>): Promise<Envelope> {
            const metadata = Object.fromEntries(fields.map((field) => [field, record[field]]));
            const payload = { ...record };
            const blob = payload.blob instanceof Blob ? payload.blob : undefined;
            if (blob) delete payload.blob;
            const row: Envelope = { ...metadata, ...await seal(utf8.encode(JSON.stringify(payload)), identity(metadata, "data")) };
            if (blob) row.media = await seal(await blob.arrayBuffer(), identity(metadata, "media"));
            return row;
          }
          async function decode(row: Envelope | undefined) {
            if (row === undefined) return undefined;
            const value = JSON.parse(decoder.decode(await unseal(row, identity(row, "data"))));
            if (row.media) {
              const bytes = await unseal(row.media, identity(row, "media"));
              value.blob = new Blob([bytes], { type: typeof value.mimeType === "string" ? value.mimeType : "" });
            }
            return value;
          }
          return {
            ...table,
            mutate: (request) => request.type === "add" || request.type === "put" ?
              Dexie.waitFor(Promise.all(request.values.map(encode))).then((values) => table.mutate({ ...request, values })) :
              table.mutate(request),
            get: (request) => table.get(request).then((value) => Dexie.waitFor(decode(value))),
            getMany: (request) => table.getMany(request).then((rows) => Dexie.waitFor(Promise.all(rows.map(decode)))),
            query: (request) => table.query(request).then((response) => request.values === false ? response :
              Dexie.waitFor(Promise.all(response.result.map(decode))).then((result) => ({ result }))),
            // The current repositories use query/get for reading values; cursor operations are key-only.
            openCursor: (request) => {
              if (request.values) throw new Error("Workspace cursor must be key-only");
              return table.openCursor(request);
            },
          };
        },
      };
    },
  });
}
