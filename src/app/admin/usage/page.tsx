import { Suspense } from "react";
import { AdminUsageView } from "@/components/AdminUsageView";

export default function AdminUsagePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AdminUsageView />
    </Suspense>
  );
}
