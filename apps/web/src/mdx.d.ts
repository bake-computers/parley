declare module "*.mdx" {
  import type { ReactElement } from "react";

  export interface MDXComponents {
    [tagName: string]: unknown;
  }

  export default function MDXContent(props: { components?: MDXComponents }): ReactElement;
}
