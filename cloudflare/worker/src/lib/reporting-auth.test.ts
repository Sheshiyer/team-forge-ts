import { describe, expect, it } from "vitest";
import { requireReportingBearerAuth } from "./reporting-auth";

function request(token?: string): Request {
  return new Request("https://forge.example/v1/reporting/weekly-context", {
    headers: token === undefined ? undefined : { authorization: `Bearer ${token}` },
  });
}

describe("reporting bearer verifier", () => {
  it("returns 503 when the dedicated secret is not configured", async () => {
    const response = await requireReportingBearerAuth(request("presented"), undefined);

    expect(response?.status).toBe(503);
    expect((await response?.json()).error.code).toBe("server_misconfigured");
  });

  it("returns 401 when no bearer is presented", async () => {
    const response = await requireReportingBearerAuth(request(), "expected-secret");

    expect(response?.status).toBe(401);
    expect((await response?.json()).error.code).toBe("missing_authorization");
  });

  it("accepts an exact dedicated bearer", async () => {
    await expect(requireReportingBearerAuth(request("expected-secret"), "expected-secret"))
      .resolves.toBeNull();
  });

  it.each([
    ["expected-secreu", "same-length mismatch"],
    ["short", "shorter mismatch"],
    ["expected-secret-with-extra-bytes", "longer mismatch"],
  ])("rejects %s using digest comparison (%s)", async (presented) => {
    const response = await requireReportingBearerAuth(request(presented), "expected-secret");

    expect(response?.status).toBe(403);
    expect((await response?.json()).error.code).toBe("invalid_authorization");
  });
});
