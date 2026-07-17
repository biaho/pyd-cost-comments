import { Suspense } from "react";
import { CommentView } from "@/components/CommentView";

export default function CommentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <CommentView />
    </Suspense>
  );
}
