"use client";

import { useEffect, useState, type ReactNode } from "react";

// Dev-only React/Router devtools. The dynamic import() calls live inside a
// DEV-only branch: import.meta.env.DEV folds to false in production builds,
// so the imports are dropped and no devtools chunks are emitted.
export function Devtools() {
  const [nodes, setNodes] = useState<ReactNode>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    let cancelled = false;
    void Promise.all([
      import("@tanstack/react-devtools"),
      import("@tanstack/react-router-devtools"),
    ]).then(([{ TanStackDevtools }, { TanStackRouterDevtoolsPanel }]) => {
      if (cancelled) {
        return;
      }
      setNodes(
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />,
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return nodes;
}
