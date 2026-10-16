import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "./navigation";

describe("safeInternalRedirect", () => {
  it.each([
    "/",
    "/explorar",
    "/oportunidades/01990000-0000-7000-8000-000000000001",
  ])("aceita %s", (path) => {
    expect(safeInternalRedirect(path)).toBe(path);
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(safeInternalRedirect(["/explorar", "https://x.com"])).toBe("/explorar");
  });

  it.each([
    undefined,
    null,
    42,
    "",
    "explorar",
    "//evil.com",
    "///evil.com",
    "https://evil.com",
    "http://evil.com/x",
    "javascript:alert(1)",
    `/${String.fromCharCode(92)}evil.com`,
    "/..",
    "/a/../b",
    "/a b",
    "/a?x=1",
    "/a#b",
    "/%2e%2e/x",
    "/entrar",
    "/cadastrar",
    "/" + "a".repeat(300),
  ])("recusa %j", (value) => {
    expect(safeInternalRedirect(value)).toBeNull();
  });
});
