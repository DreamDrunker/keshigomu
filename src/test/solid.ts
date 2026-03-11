import { createRoot } from "solid-js";

export const createTestRoot = <T,>(factory: () => T) => {
  let dispose: VoidFunction = () => undefined;
  const value = createRoot<T>((nextDispose) => {
    dispose = nextDispose;
    return factory();
  });

  return { dispose, value };
};
