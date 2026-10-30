import { probeOf } from "./stream-probe";

jest.mock("./net", () => ({ appFetch: jest.fn() }));

test("a range answer is ok, a refusal or a gone URL is refused, a server error is unreachable", () => {
  expect(probeOf(206)).toBe("ok");
  expect(probeOf(200)).toBe("ok");
  expect(probeOf(403)).toBe("refused");
  expect(probeOf(410)).toBe("refused");
  expect(probeOf(404)).toBe("refused");
  expect(probeOf(503)).toBe("unreachable");
});
