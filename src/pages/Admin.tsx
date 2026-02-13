import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, LogOut, Key, Activity } from "lucide-react";
import { TokenManager } from "@/components/admin/TokenManager";
import { LiveDashboard } from "@/components/admin/LiveDashboard";
import { StockMonitor } from "@/components/admin/StockMonitor";

const Admin = () => {
  const { user, loading, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate("/auth");
    }
  }, [user, loading, isAdmin, navigate]);

  if (loading || !user || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-success/5 blur-3xl" />
      </div>

      <header className="relative border-b border-border bg-card/50 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Key className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{user.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="relative container mx-auto px-4 py-8">
        <StockMonitor />

        <Tabs defaultValue="tokens" className="space-y-6">
          <TabsList className="bg-secondary">
            <TabsTrigger value="tokens" className="gap-2">
              <Key className="h-4 w-4" />
              Tokens
            </TabsTrigger>
            <TabsTrigger value="live" className="gap-2">
              <Activity className="h-4 w-4" />
              Ao Vivo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tokens">
            <TokenManager />
          </TabsContent>

          <TabsContent value="live">
            <LiveDashboard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
