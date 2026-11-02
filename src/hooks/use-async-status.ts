export function useAsyncStatus<T>() {
  type Status = "idle" | "loading" | "processing" | "success" | "error";
  return {
    idle: "idle" as Status,
    loading: "loading" as Status,
    processing: "processing" as Status,
    success: "success" as Status,
    error: "error" as Status,
  } satisfies Record<string, Status>;
}
