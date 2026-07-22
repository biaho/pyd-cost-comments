import { Suspense } from "react";
import { CommentView } from "@/components/CommentView";
import { resolveReport, resolveProduct } from "@/lib/data-api-client";

export const dynamic = "force-dynamic";

export default async function CommentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const isTestMode = process.env.ENABLE_LINK_TEST_MODE === "true";

  if (isTestMode) {
    return <TestModeValidation searchParams={searchParams} />;
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <CommentView />
    </Suspense>
  );
}

async function TestModeValidation({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const get = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };

  const reportId = get("reportId");
  const productId = get("productId");
  const targitUser = get("targitUser");

  let report: { ok: true; reportKey: number } | { ok: false; error: string } | null = null;
  if (reportId) {
    try {
      report = { ok: true, reportKey: await resolveReport(reportId) };
    } catch (err) {
      report = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  let product:
    | { ok: true; data: Awaited<ReturnType<typeof resolveProduct>> }
    | { ok: false; error: string }
    | null = null;
  if (productId) {
    try {
      product = { ok: true, data: await resolveProduct(productId) };
    } catch (err) {
      product = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 720, margin: "0 auto", padding: 24, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Validación de enlace TARGIT (modo prueba)</h1>
      <p style={{ marginBottom: 16 }}>
        Los datos visualizados en esta solo confirma que el enlace generado desde TARGIT llega con los parámetros
        correctos y también que los IDs resuelven bien contra la base de datos interna.
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24, marginBottom: 12 }}>Parámetros recibidos en la llamada:</h2>
      <pre style={{ background: "#111", color: "#0f0", padding: 12, overflowX: "auto", marginBottom: 24 }}>
        {JSON.stringify(params, null, 2)}
      </pre>

      <h2 style={{ fontSize: 16, marginTop: 24, marginBottom: 16 }}>Validaciones contra BBDD en tiempo real:</h2>

      <div style={{ marginBottom: 16 }}>
        <p style={{ marginBottom: 8 }}>* reportId</p>
        <div style={{ marginLeft: 24 }}>
          {!reportId ? (
            <p style={{ color: "#ff6b6b" }}>⚠️ No se recibió reportId.</p>
          ) : report?.ok ? (
            <p style={{ color: "#51cf66" }}>✅ Resuelto correctamente. report_key = {report.reportKey}</p>
          ) : (
            <p style={{ color: "#ff6b6b" }}>❌ Error al resolver.</p>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <p style={{ marginBottom: 8 }}>* productId</p>
        <div style={{ marginLeft: 24 }}>
          {!productId ? (
            <p style={{ color: "#ff6b6b" }}>⚠️ No se recibió productId.</p>
          ) : !product?.ok ? (
            <p style={{ color: "#ff6b6b" }}>❌ Error al resolver.</p>
          ) : product.data ? (
            <p style={{ color: "#51cf66" }}>✅ Producto encontrado.</p>
          ) : (
            <p style={{ color: "#ffd43b" }}>⚠️ productId no encontrado en el maestro de productos.</p>
          )}
        </div>
      </div>
    </div>
  );
}
