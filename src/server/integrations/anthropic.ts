/**
 * Mode A: turning a sentence into a specification (§6.1).
 *
 * The model's job is narrow on purpose. It picks an item type and some
 * attributes out of the library's own catalogue, and says which values the
 * person gave. It never writes ImpEx: there is no field in the schema for a
 * modifier, a qualifier, a macro or a header line, so a modifier it invented
 * has nowhere to go. Everything it returns is then checked against the
 * catalogue before a specification is built, and the specification goes through
 * the same generator the field picker uses.
 *
 * The reason for all that is one line in the brief: a hallucinated modifier
 * reaching production output with nothing in between is the failure this design
 * exists to prevent.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
// zod/v4 rather than the package root: the SDK's `zodOutputFormat` helper is
// typed against zod 4, which ships inside the same zod package. The routes use
// the v3 entry point; the two do not meet.
import { z } from 'zod/v4';
import type { Catalogue } from '../domain/catalogue.js';
import { env } from '../config/env.js';

/**
 * Every field is required and nullable rather than optional: a strict JSON
 * schema wants each property present, and "null" is a clearer answer from a
 * model than a missing key.
 */
const resolutionSchema = z.object({
  itemType: z.string().describe('The item type to load, exactly as spelled in the catalogue.'),
  name: z.string().describe('A short name for this load sheet, in title case, e.g. "Editors Pick".'),
  direction: z
    .enum(['import', 'export'])
    .describe(
      'import to load data into SAP Commerce, export to pull data out of it as a CSV. A request that says "export", "pull out", "get a list of" or similar is an export.',
    ),
  exportSelection: z
    .object({
      kind: z
        .enum(['skuList', 'skuWildcard', 'attributeWildcard'])
        .describe(
          'skuList for an explicit list of codes, skuWildcard for a pattern on the code, attributeWildcard for a pattern on some other attribute (or everything that has one at all).',
        ),
      codes: z.array(z.string()).describe('For skuList: the codes named in the request. Empty otherwise. Never invented.'),
      pattern: z
        .string()
        .describe('For the wildcard kinds: the SQL LIKE pattern, e.g. "173%". Use "%" to mean any value at all. Empty for skuList.'),
      attribute: z.string().describe('For attributeWildcard: the attribute to match on. Empty otherwise.'),
    })
    .nullable()
    .describe('How an export picks its rows. Null for an import.'),
  operation: z
    .enum(['INSERT_UPDATE', 'UPDATE'])
    .describe(
      'INSERT_UPDATE unless the request is clear that the records must already exist and nothing new should be created.',
    ),
  fields: z
    .array(
      z.object({
        attribute: z
          .string()
          .describe(
            'The attribute name, spelled exactly as in the catalogue when it is there. When the request names something the catalogue does not have, use the name the person used - never substitute a similar one.',
          ),
        inCatalogue: z.boolean().describe('Whether you found this attribute in the catalogue you were given.'),
        variant: z
          .string()
          .nullable()
          .describe(
            'When the catalogue offers more than one shape for this attribute and the request makes clear which is wanted (adding values rather than replacing them, say), the exact shape text. Otherwise null, and the generator will use the shape the closest sheet uses.',
          ),
        why: z.string().describe('One short clause saying why this field is in the sheet. Shown to the user.'),
      }),
    )
    .describe('The fields to load, in the order they should appear as columns. Do not include the key column.'),
  rows: z
    .array(z.array(z.string()))
    .nullable()
    .describe(
      'Data rows, but only when the request actually contains the values - a list of SKUs and what to set. One array per row: the key first, then one value per field, in the same order. Never invent codes, SKUs or values that are not in the request.',
    ),
  clarification: z
    .string()
    .nullable()
    .describe(
      'Set this only when the request cannot be resolved without asking - the item type is unclear, or two catalogue attributes fit equally well. One question, in plain English. Otherwise null.',
    ),
  summary: z.string().describe('One or two sentences saying what this load sheet will do, for the person to check.'),
});

export type Resolution = z.infer<typeof resolutionSchema>;

const SYSTEM = `You turn a plain-English request from the Watches of Switzerland e-commerce team into a specification for a SAP Commerce (Hybris) ImpEx load sheet.

You do not write ImpEx. You choose an item type and the attributes to load; another part of the app writes the script from what you return, using the modifiers and conventions from load sheets the team has already run. There is nothing you can return that puts text into the script directly, and that is deliberate.

Work from the catalogue you are given, which is everything the app knows:

- Use an attribute name exactly as the catalogue spells it when the request means that attribute. The request will often describe a field rather than name it ("the flag that hides the manufacturer part number" is isManufacturerProductNumberHidden).
- When the request names something the catalogue does not have, keep the name the person used and set inCatalogue false. Do not quietly substitute a name that looks similar: the app tells them what it is close to, and a silent correction would be worse than either. A new attribute is a normal thing to ask for; it just gets flagged.
- Do not add fields the request did not ask for. The key column is written for you - never include it.
- Only fill in rows when the request contains the actual values. A request that says "for these SKUs: 17331268, 17331097" has rows; one that says "we will paste the SKUs in later" does not.
- Booleans are written TRUE and FALSE.
- An export pulls data out rather than loading it in: it has no rows going in, and it needs to say which records to pull - a list of codes the request names, a code wildcard, or a wildcard on another attribute. The columns are still chosen the same way.
- Ask a clarifying question only when you genuinely cannot resolve the request - not to confirm something you can already work out.`;

export interface ResolverInput {
  description: string;
  catalogue: Catalogue;
}

export interface ResolverResult {
  resolution: Resolution;
  /** What the request cost, for the log. */
  usage: { inputTokens: number; outputTokens: number };
}

export type Resolver = (input: ResolverInput) => Promise<ResolverResult>;

/**
 * The catalogue as text for the prompt.
 *
 * Item types first, then every attribute the library knows for each, with
 * WOSG's own heading and what kind of value it takes. The alternative shapes
 * are listed where an attribute has more than one, because choosing between
 * append and remove is a judgement the request often settles.
 */
export function catalogueForPrompt(catalogue: Catalogue): string {
  const lines: string[] = ['# Item types', ''];
  for (const type of catalogue.itemTypes) {
    lines.push(`- ${type.itemType} (${type.attributes} attributes, used by ${type.templates} of the team's sheets)`);
  }

  for (const type of catalogue.itemTypes) {
    const entries = catalogue.forItemType(type.itemType).filter((entry) => entry.kind === 'attribute');
    if (entries.length === 0) continue;
    lines.push('', `# Attributes on ${type.itemType}`, '');
    for (const entry of entries) {
      const parts = [`- ${entry.attribute}`];
      const label = entry.variants.flatMap((v) => v.labels)[0]?.label;
      if (label) parts.push(`"${label}"`);
      parts.push(`(${entry.boolean ? 'TRUE/FALSE' : entry.primary.shape.type}${entry.primary.shape.localized ? ', per language' : ''})`);
      if (entry.keyColumn) parts.push('- this is the key, written for you');
      lines.push(parts.join(' '));
      if (entry.variants.length > 1) {
        for (const variant of entry.variants) {
          lines.push(`    shape: ${variant.signature}`);
        }
      }
    }
  }
  return lines.join('\n');
}

export function isResolverConfigured(): boolean {
  return env.anthropicApiKey !== undefined;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export const resolveWithClaude: Resolver = async ({ description, catalogue }) => {
  const response = await getClient().messages.parse({
    model: 'claude-opus-5',
    max_tokens: 8000,
    system: [
      // The catalogue is the same on every request and dwarfs the question, so
      // it is cached; the request itself goes after the breakpoint.
      { type: 'text' as const, text: SYSTEM },
      {
        type: 'text' as const,
        text: `Here is everything the app knows about the team's load sheets.\n\n${catalogueForPrompt(catalogue)}`,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages: [{ role: 'user', content: description }],
    output_config: { format: zodOutputFormat(resolutionSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error('The model did not return a specification that could be read.');
  return {
    resolution: parsed,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
};
