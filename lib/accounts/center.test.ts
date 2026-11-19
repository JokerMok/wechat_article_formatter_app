import { afterEach, describe, expect, it, vi } from "vitest";
import { center, entitlementsSchema } from "./center";
vi.mock("./config", async () => {
  const actual = await vi.importActual<typeof import("./config")>("./config");
  return { ...actual, accountConfig: () => ({center:"https://accounts.example", product:"formatter", serviceKey:"test-service-key"}) };
});
afterEach(() => vi.unstubAllGlobals());
const identity = {uid:"fixed-uid",issuer:"https://identity.example",subject:"stable-subject",organization:"built-in",blocked:false};
function response(user: object) { vi.stubGlobal("fetch",vi.fn(async () => Response.json({user}))); }
describe("trusted platform owner integration", () => {
  it("accepts only the center-verified platform owner, without inferring from username",async () => {
    response({...identity,platform_owner:true});
    expect((await center.identity("signed-token")).subject).toBe("stable-subject");
    response({...identity,username:"admin"});
    await expect(center.identity("signed-token")).rejects.toThrow("该消费者账号当前不可用");
    response({...identity,platform_owner:true,blocked:true});
    await expect(center.identity("signed-token")).rejects.toThrow();
    response({...identity,organization:"consumers"});
    expect((await center.identity("signed-token")).platform_owner).toBe(false);
  });
  it("preserves permanent and unlimited flags while supporting ordinary existing balances",() => {
    const rights={product:{id:"formatter"},membership:{active:true,expires_at:null,permanent:true},features:[{id:"render",name:"生成",kind:"quota",allowed:true,remaining:2147483647,held:0,unlimited:true}]};
    expect(entitlementsSchema.parse(rights).features[0].unlimited).toBe(true);
    const ordinary=entitlementsSchema.parse({...rights,membership:{active:false,expires_at:null},features:[{...rights.features[0],unlimited:undefined,remaining:2}]});
    expect(ordinary.membership.permanent).toBe(false);
    expect(ordinary.features[0].unlimited).toBe(false);
  });
  it("resolves launch context using only product backend credentials", async () => {
    const fetcher=vi.fn(async()=>Response.json({uid:"b21d9dc4-779e-41c6-a3c9-793454183bd0",platform_owner:true}));
    vi.stubGlobal("fetch",fetcher);
    await center.launch("opaque-launch-context");
    const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe("https://accounts.example/api/v1/products/formatter/login-context");
    expect(options.body).toBe(JSON.stringify({context:"opaque-launch-context"}));
    expect((options.headers as Record<string,string>)["X-User-Token"]).toBeUndefined();
  });
});
