import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const SIMULATED_LINK =
  "/comment?reportId=SIM-R1&reportName=Coste+Interno&productId=SIM-P12345&productName=ProductoZ&brand=MarcaX&fragrance=FraganciaY&periodLabel=Jun-2025_to_Sep-2025";

// Hidden now that Entra ID SSO is live — kept for potential future dev/demo use, not deleted.
const SHOW_SIMULATED_LINK_BUTTON = false;

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">PYD Cost Comments</CardTitle>
          </div>
          <CardDescription>
            Esta aplicación se abre desde un enlace de &quot;Comentario&quot; incrustado en informes de coste de PYD en TARGIT. No es posible acceder directamente. Contacte con su administrador para más información.
          </CardDescription>
        </CardHeader>
        {SHOW_SIMULATED_LINK_BUTTON && (
          <CardContent>
            <Button asChild variant="secondary" className="w-full">
              <Link href={SIMULATED_LINK}>Abrir con un enlace de informe simulado (dev)</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
