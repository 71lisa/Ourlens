import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Masukkan alamat email yang valid."),
  password: z.string().min(8, "Kata sandi minimal 8 karakter."),
});

export const registerSchema = z
  .object({
    name: z.string().min(2, "Silakan masukkan nama Anda.").max(80),
    email: z.string().email("Masukkan alamat email yang valid."),
    password: z.string().min(8, "Kata sandi minimal 8 karakter."),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Kata sandi tidak cocok.",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
