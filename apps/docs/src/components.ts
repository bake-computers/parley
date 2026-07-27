/**
 * MDX globals registry — components available inside MDX without `import`.
 * Wired via `<Content components={components} />` in `[...slug].astro`.
 * Add new components here as you build (or install) them.
 */

import { Aside } from "./components/ui/aside";
import Render from "./components/Render.astro";
import { Badge } from "./components/ui/badge";
import { Card } from "./components/ui/card";
import { CardGrid } from "./components/ui/card-grid";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/ui/collapsible";
import { LayerCard, LayerCardContent, LayerCardHeader } from "./components/ui/layer-card";
import { PackageManagers } from "./components/ui/package-managers";
import { Step, Steps } from "./components/ui/steps";
import { Tabs, TabItem } from "./components/ui/tabs";

export const components = {
  Aside,
  Badge,
  Card,
  CardGrid,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  LayerCard,
  LayerCardContent,
  LayerCardHeader,
  PackageManagers,
  Render,
  Step,
  Steps,
  TabItem,
  Tabs,
};
