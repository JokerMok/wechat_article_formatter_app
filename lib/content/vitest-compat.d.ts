import type { Mock } from "@vitest/spy";

declare module "@vitest/spy" {
  function fn<TImplementation extends (...args: unknown[]) => unknown>(
    originalImplementation: TImplementation
  ): Mock<(...args: [unknown[], ...unknown[]]) => ReturnType<TImplementation>>;
}
