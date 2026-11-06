import { describe, expect, it } from "vitest";
import type { lookup } from "node:dns/promises";
import { isPublicAddress, resolvePublicURL } from "./safe-fetch";
const resolver = (addresses: string[]) =>
  (async () =>
    addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    }))) as unknown as typeof lookup;
describe("reference capture SSRF boundaries", () => {
  it("rejects local, metadata, mapped and reserved network addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "172.16.1.1",
      "192.168.0.2",
      "100.64.0.1",
      "0.0.0.0",
      "224.1.1.1",
      "::1",
      "::ffff:127.0.0.1",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
      "2002:7f00:1::",
    ])
      expect(isPublicAddress(address), address).toBe(false);
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("validates all DNS answers, normalized IP notation and credentials", async () => {
    for (const url of [
      "http://2130706433/",
      "http://0x7f000001/",
      "http://[::1]/",
      "http://localhost/",
      "http://service.local/",
      "file:///etc/passwd",
      "https://user:pass@example.com/",
      "http://example.com:8080/",
    ])
      await expect(
        resolvePublicURL(url, resolver(["93.184.216.34"])),
      ).rejects.toThrow();
    await expect(
      resolvePublicURL(
        "https://example.com",
        resolver(["93.184.216.34", "127.0.0.1"]),
      ),
    ).rejects.toThrow();
    expect(
      (
        await resolvePublicURL(
          "https://example.com",
          resolver(["93.184.216.34"]),
        )
      ).address.address,
    ).toBe("93.184.216.34");
  });
});
