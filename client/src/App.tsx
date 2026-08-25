// The Lost Pair visual reminder: the full browser window is an immersive toy-scale rescue stage, not a conventional website layout.
// /stats is the one exception -- a real page (see StatsPage.tsx) rather than another game surface, so it needs actual routing.

import { Route, Switch } from "wouter";
import GameCanvas from "@/components/GameCanvas";
import StatsPage from "@/pages/StatsPage";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={GameCanvas} />
      <Route path="/stats" component={StatsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}
