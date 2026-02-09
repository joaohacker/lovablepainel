import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditSelector } from "@/components/CreditSelector";
import { GenerationStatus } from "@/components/GenerationStatus";
import { useFarmGeneration } from "@/hooks/useFarmGeneration";
import { Zap } from "lucide-react";

const Index = () => {
  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const farm = useFarmGeneration();
  const isIdle = farm.state === "idle";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background gradient effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-success/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Zap className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Gerador de Créditos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gere créditos Lovable automaticamente
          </p>
        </div>

        {/* Main card */}
        <Card className="glass-card">
          <CardContent className="p-6 md:p-8">
            {isIdle ? (
              <CreditSelector
                onGenerate={farm.startGeneration}
                disabled={farm.state !== "idle"}
              />
            ) : (
              <GenerationStatus
                state={farm.state}
                masterEmail={farm.masterEmail}
                queuePosition={farm.queuePosition}
                workspaceName={farm.workspaceName}
                creditsEarned={farm.creditsEarned}
                totalCreditsRequested={farm.totalCreditsRequested}
                result={farm.result}
                errorMessage={farm.errorMessage}
                logs={farm.logs}
                expiresAt={farm.expiresAt}
                onCancel={farm.cancelGeneration}
                onReset={farm.reset}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
