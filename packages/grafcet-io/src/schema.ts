import { z } from 'zod';
import type { Item, Project } from '@grafcet/core';

/** Schémas Zod du format natif. L'ordre des clés ici fixe l'ordre de sérialisation (déterministe). */
const ActionSchema = z.object({
  kind: z.enum(['continue', 'conditional', 'activation', 'deactivation']),
  label: z.string(),
  cond: z.string(),
});
const StepSchema = z.object({
  id: z.string().min(1), kind: z.literal('step'), num: z.number().int().min(0),
  name: z.string(), initial: z.boolean(), actions: z.array(ActionSchema),
});
const TransSchema = z.object({ id: z.string().min(1), kind: z.literal('trans'), num: z.number().int().min(0), recept: z.string() });
const JumpSchema = z.object({ id: z.string().min(1), kind: z.literal('jump'), target: z.string().nullable() });

export const ItemSchema: z.ZodType<Item> = z.lazy(() =>
  z.union([
    StepSchema, TransSchema, JumpSchema,
    z.object({ id: z.string().min(1), kind: z.enum(['or', 'and']), branches: z.array(z.array(ItemSchema)) }),
  ]),
) as z.ZodType<Item>;

export const GrafcetSchema = z.object({
  id: z.string().min(1), name: z.string(), comment: z.string().optional(), nextStep: z.number().int().min(0), nextTrans: z.number().int().min(0),
  items: z.array(ItemSchema),
});
export const ProjectSchema: z.ZodType<Project> = z.object({
  name: z.string(), counter: z.number().int().min(0), gcount: z.number().int().min(0), grafcets: z.array(GrafcetSchema),
});

export const FORMAT_ID = 'grafcet-studio-project';
export const SCHEMA_VERSION = '1.0.0';
