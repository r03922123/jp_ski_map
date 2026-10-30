"use client";

/**
 * Route-level error boundary: an unexpected error (e.g. while navigating) shows this
 * instead of a blank page. GPS and the wake lock stop with the unmounted map.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The map stopped. If you were navigating, check the road and your
        surroundings, then try again.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground">Ref: {error.digest}</p>
      )}
      <button
        type="button"
        className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white"
        onClick={reset}
      >
        Try again
      </button>
    </main>
  );
}
