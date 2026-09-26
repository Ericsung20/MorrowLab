import { useCallback, useEffect, useState } from "react";
export function useLoad<T>(loader: () => Promise<T>) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    loader: typeof loader;
    version: number;
    data?: T;
    error?: string;
  }>();
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    loader()
      .then((data) => {
        if (alive) setResult({ loader, version, data });
      })
      .catch((e) => {
        if (alive)
          setResult({
            loader,
            version,
            error:
              e instanceof Error
                ? e.message
                : "Something went wrong. Please try again.",
          });
      });
    return () => {
      alive = false;
    };
  }, [loader, version]);
  const loading = result?.loader !== loader || result?.version !== version;
  return {
    data: loading ? undefined : result?.data,
    error: loading ? "" : (result?.error ?? ""),
    loading,
    reload,
  };
}
