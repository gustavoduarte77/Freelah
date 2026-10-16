import { z } from "zod";
import { publicJobStatusSchema } from "./jobs";
import { interestStatusSchema, inviteStateSchema } from "./interests";

// Contrato do chat (PRD 18): uma conversa por interesse, entre quem demonstrou interesse e a dona da
// oportunidade. As respostas nunca trazem telefone, e-mail nem ids de outras pessoas: cada mensagem
// só diz se é minha.

export const MESSAGE_MAX = 2000;
export const CHAT_POLL_INTERVAL_MS = 3000;

/** Mensagem de texto: aparada, de 1 a 2000 caracteres, sem caracteres de controle (exceto quebra de linha). */
export const sendMessageSchema = z.strictObject({
  content: z
    .string({ error: "Escreva a mensagem." })
    .transform((value) => value.trim())
    // eslint-disable-next-line no-control-regex
    .refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value), "Há caracteres que não são aceitos.")
    .pipe(z.string().min(1, "Escreva a mensagem.").max(MESSAGE_MAX, `A mensagem pode ter no máximo ${MESSAGE_MAX} caracteres.`)),
});

export const chatMessageSchema = z.object({
  id: z.string(),
  fromMe: z.boolean(),
  content: z.string(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatMessagesResponseSchema = z.object({
  messages: z.array(chatMessageSchema),
  /** Marcador da última mensagem devolvida; use em `after` para buscar só as novas. */
  cursor: z.string().nullable(),
});
export type ChatMessagesResponse = z.infer<typeof chatMessagesResponseSchema>;

export const sendMessageResponseSchema = z.object({ message: chatMessageSchema });

const conversationJobSchema = z.object({ id: z.string(), title: z.string(), status: publicJobStatusSchema });

/** Dados públicos do serviço, para o convite e a confirmação de contratação. */
const conversationJobDetailSchema = conversationJobSchema.extend({
  proposedPriceCents: z.number().int().nonnegative(),
  scheduledDate: z.string(),
  startTime: z.string(),
  city: z.string(),
  state: z.string(),
});

export const conversationSchema = z.object({
  id: z.string(),
  job: conversationJobDetailSchema,
  /** Quem está vendo é o contratante (dono da oportunidade) ou o trabalhador. */
  viewerIsOwner: z.boolean().default(false),
  /** Situação da contratação nesta conversa. */
  interest: z.object({ id: z.string(), status: interestStatusSchema, invite: inviteStateSchema }).optional(),
  other: z.object({ name: z.string() }),
  /** Se ainda dá para enviar mensagens (a conversa continua disponível para leitura). */
  canSend: z.boolean(),
  blockedReason: z.string().nullable(),
});
export type Conversation = z.infer<typeof conversationSchema>;
export const conversationResponseSchema = z.object({ conversation: conversationSchema });

export const openConversationResponseSchema = z.object({ conversation: z.object({ id: z.string() }) });

export const conversationListItemSchema = z.object({
  id: z.string(),
  job: conversationJobSchema,
  other: z.object({ name: z.string() }),
  interestStatus: interestStatusSchema,
  lastMessage: z.object({ content: z.string(), createdAt: z.string(), fromMe: z.boolean() }).nullable(),
});
export type ConversationListItem = z.infer<typeof conversationListItemSchema>;
export const conversationListResponseSchema = z.object({ conversations: z.array(conversationListItemSchema) });
