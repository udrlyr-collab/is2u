import { describe, expect, it } from "vitest";
import { appVersionLabel, normalizeAppVersion } from "../../apps/web/lib/app-version";

describe("app version display", () => {
  it("uses one v prefix and trims the build value", () => {
    expect(normalizeAppVersion(" 1.2.3 ")).toBe("1.2.3");
    expect(appVersionLabel("1.2.3")).toBe("v1.2.3");
    expect(appVersionLabel("v1.2.3")).toBe("v1.2.3");
    expect(appVersionLabel("vv1.2.3")).toBe("v1.2.3");
  });

  it("renders no version when the build value is absent", () => {
    expect(normalizeAppVersion(undefined)).toBeNull();
    expect(appVersionLabel("")).toBeNull();
  });
});
