import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/AuthPage";
import HomePage from "@/pages/HomePage";
import GamePage from "@/pages/GamePage";
import SocialPage from "@/pages/SocialPage";
import ProfilePage from "@/pages/ProfilePage";
import { GlobalInviteListener } from "@/components/GlobalInviteListener";

function ProtectedRoute({ component: Component, ...rest }: { component: React.ComponentType<any> } & any) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return <Component {...rest} />;
}

function Router() {
  return (
    <>
      <GlobalInviteListener />
      <Switch>
        <Route path="/auth" component={AuthPage} />
      
      {/* Protected Routes */}
      <Route path="/">
        {() => <ProtectedRoute component={HomePage} />}
      </Route>
      
      <Route path="/game/:mode/:id">
        {() => <ProtectedRoute component={GamePage} />}
      </Route>

      <Route path="/social">
        {() => <ProtectedRoute component={SocialPage} />}
      </Route>

      <Route path="/profile">
        {() => <ProtectedRoute component={ProfilePage} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
