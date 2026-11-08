export class AppError extends Error {
  readonly userMessage: string;
  readonly statusCode: number;
  readonly code: string;

  constructor(options: {
    message: string;
    userMessage?: string;
    statusCode?: number;
    code?: string;
  }) {
    super(options.message);
    this.name = "AppError";
    this.userMessage = options.userMessage ?? "Terjadi kesalahan. Silakan coba lagi.";
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "INTERNAL_ERROR";
  }
}

export function toUserError(error: unknown): string {
  if (error instanceof AppError) {
    return error.userMessage;
  }
  return "Terjadi kesalahan. Silakan coba lagi.";
}

export function logError(error: unknown, context?: string) {
  const prefix = context ? `[${context}]` : "[error]";
  if (error instanceof Error) {
    console.error(prefix, error.message, error.stack);
    return;
  }
  console.error(prefix, error);
}
