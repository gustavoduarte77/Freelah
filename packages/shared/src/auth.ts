import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Telefone brasileiro com DDD: aceita máscara e guarda só os dígitos (10 ou 11). */
export const phoneSchema = z
  .string("Informe seu telefone com DDD.")
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{10,11}$/, "Informe o telefone com DDD (10 ou 11 dígitos)."));

/** Cadastro (PRD 10.1 e declaração de maioridade). Usado pelo app e revalidado na API. */
export const signUpSchema = z.object({
  name: z
    .string("Informe seu nome.")
    .trim()
    .min(2, "Informe seu nome.")
    .max(100, "O nome pode ter até 100 caracteres."),
  email: z.string("Informe seu e-mail.").trim().pipe(z.email("Informe um e-mail válido.")),
  password: z
    .string("Informe uma senha.")
    .min(PASSWORD_MIN_LENGTH, `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
    .max(PASSWORD_MAX_LENGTH, `A senha pode ter até ${PASSWORD_MAX_LENGTH} caracteres.`),
  phone: phoneSchema,
  city: z
    .string("Informe sua cidade.")
    .trim()
    .min(2, "Informe sua cidade.")
    .max(100, "A cidade pode ter até 100 caracteres."),
  adultConfirmed: z.literal(true, {
    error: "É preciso declarar que você tem 18 anos ou mais.",
  }),
});

export type SignUpInput = z.input<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string("Informe seu e-mail.").trim().pipe(z.email("Informe um e-mail válido.")),
  password: z.string("Informe sua senha.").min(1, "Informe sua senha."),
});

export type SignInInput = z.input<typeof signInSchema>;

/**
 * Contrato de GET /me: perfil do PRÓPRIO usuário autenticado.
 * O telefone é privado e só aparece aqui, para o dono da conta; nunca em respostas
 * públicas nem em listas de interessados.
 */
export const meResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  city: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
