/**
 * Turning "all orders from the last week with the order number and date" into
 * a query specification (§ Queries tab).
 *
 * The same rule as the load sheet side, for the same reason: there is no field
 * in this schema that holds query text. The model chooses types, fields, joins
 * and conditions by name, they are checked against WOSG's own query library,
 * and `formatFlexQuery` writes the SQL. A hallucinated field reaches the screen
 * with a warning beside it rather than reaching the console unremarked.
 *
 * Dates are resolved here rather than left to the model: "last week" is a range
 * this app can compute and show, and their queries write literal timestamps.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import { catalogsForPrompt } from '../../shared/catalogs.js';
import { sitesForPrompt } from '../../shared/sites.js';
import type { FlexLibrary } from '../library/flexLibrary.js';

const fieldRef = z.object({
  alias: z.string().describe('The alias of the type this field is on, as declared in from or joins.'),
  field: z.string().describe('The field name, spelled as the catalogue spells it when it is there.'),
});

const condition = fieldRef.extend({
  op: z
    .enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'like', 'in', 'notIn', 'isNull', 'isNotNull'])
    .describe('How to compare. Use like for wildcards, with % in the value.'),
  value: z.string().nullable().describe('The value to compare against. Null for in, notIn, isNull and isNotNull.'),
  values: z.array(z.string()).nullable().describe('The list, for in and notIn. Null otherwise.'),
  column: fieldRef.nullable().describe('Set instead of value to compare against another column, as a join does.'),
});

export const flexResolutionSchema = z.object({
  kind: z
    .enum(['reporting', 'export'])
    .describe(
      'reporting when the answer is columns to read in the console. export when it feeds an ImpEx exportItemsFlexibleSearch, which selects only the PK of the items.',
    ),
  name: z.string().describe('A short name for this query, in the words the user used.'),
  distinct: z.boolean().describe('True when joins would otherwise repeat a row.'),
  from: z
    .object({ type: z.string(), alias: z.string() })
    .describe('The type the query is about, and a short alias - its initials, as WOSG alias one.'),
  joins: z
    .array(
      z.object({
        type: z.string(),
        alias: z.string(),
        left: z.boolean().describe('True when the row may legitimately have no match.'),
        on: z.array(condition).describe('How this type is joined, usually one column equalling another.'),
      }),
    )
    .describe('Types to join. Empty when the query needs none.'),
  select: z
    .array(
      fieldRef.extend({
        label: z.string().nullable().describe('The heading, in plain words. Null to leave the column unheaded.'),
      }),
    )
    .describe('The columns to return, in order. For an export, exactly one: the PK of the type in from.'),
  where: z.array(condition).describe('Conditions, ANDed together. Empty when the query returns everything.'),
  orderBy: z
    .array(fieldRef.extend({ direction: z.enum(['asc', 'desc']) }))
    .describe('Ordering. Empty when it does not matter.'),
  clarification: z
    .string()
    .nullable()
    .describe(
      'Set only when the request cannot be answered with this shape - it needs a subselect, a GROUP BY, a CASE or an aggregate - or when it is genuinely ambiguous. One question, in plain English. Otherwise null.',
    ),
  summary: z.string().describe('One or two sentences saying what this query returns, for the person to check.'),
  notes: z.array(z.string()).describe('Anything worth saying: a date range you resolved, an assumption you made.'),
});

export type FlexResolution = z.infer<typeof flexResolutionSchema>;

const SYSTEM = `You turn a plain-English request from the Watches of Switzerland e-commerce team into a specification for a SAP Commerce FlexibleSearch query.

You do not write FlexibleSearch. You choose types, fields, joins and conditions by name; another part of the app writes the query from what you return. There is no field you can return that puts SQL text into the query, and that is deliberate.

Work from the catalogue you are given, which is read out of the queries this team has actually run:

- Use a type and a field exactly as the catalogue spells them when the request means that one. The request will describe rather than name ("the order number" is Order.code, "when it was placed" is Order.date).
- When the request needs something the catalogue does not have, keep the name the person used. Do not substitute a similar one: the app says what it is close to, and a silent correction is worse than either.
- Alias a type by its initials, the way they do: Order o, OrderEntry oe, BaseStore bs, CatalogVersion cv.
- Copy a join condition from the catalogue's join list when there is one for that pair. They have already worked out how these types connect.
- A reporting query selects the columns somebody wants to read, each with a plain-English label. An export query selects exactly one column - the PK of the type in from - because it feeds exportItemsFlexibleSearch, and selecting anything else makes an export that runs and writes nothing.
- Set distinct when a join would otherwise repeat a row.
- Dates are written as literal timestamps, 'YYYY-MM-DD HH:MM:SS'. Resolve a relative range yourself against the date you are given, and say in notes what range you used.
- Never match on a PK. The catalogue lists a few they use, but a PK is a different row in every environment, so a query carrying one returns nothing when it is run somewhere else. Match on the code or the name instead, joining EnumerationValue where the field is an enum.
- The sites, their order-number prefixes and the click-and-collect rule are given below. Use them: "UK orders" means the UK sites' prefixes or their base stores, and "direct orders, no click and collects" means order codes that do not begin with S. Never invent a prefix that is not listed.
- Ask a clarifying question only when you genuinely cannot answer - the request needs a subselect, a GROUP BY, an aggregate or a CASE, which this shape does not carry - or when two readings would return different rows.`;

export function catalogueForPrompt(library: FlexLibrary, limit = 40): string {
  const lines: string[] = [sitesForPrompt(), '', catalogsForPrompt(), '', 'TYPES AND THE FIELDS THEY HAVE QUERIED', ''];
  for (const type of library.types.slice(0, limit)) {
    lines.push(`${type.type} (${type.uses} queries): ${type.fields.join(', ')}`);
  }
  lines.push('', 'JOINS THEY HAVE WRITTEN', '');
  for (const join of library.joins.slice(0, 40)) lines.push(`${join.from} to ${join.to}: ON ${join.on}`);
  if (library.notes.length > 0) {
    lines.push('', 'PKS THEY HAVE WRITTEN DOWN THE MEANING OF (do not put these in a query)', '');
    lines.push(...library.notes);
  }
  return lines.join('\n');
}

export interface FlexResolverInput {
  description: string;
  library: FlexLibrary;
  today: string;
}

export type FlexResolver = (input: FlexResolverInput) => Promise<{ resolution: FlexResolution }>;

export function anthropicFlexResolver(apiKey: string): FlexResolver {
  const client = new Anthropic({ apiKey });
  return async ({ description, library, today }) => {
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      // A query specification is a few hundred tokens. The headroom here is
      // for a long IN list, not for thinking - and an unbounded ceiling is
      // minutes of generation on a request somebody is watching, which is how
      // a phone gives up on the connection and reports "failed to fetch".
      max_tokens: 3000,
      system: [
        { type: 'text' as const, text: SYSTEM },
        {
          type: 'text' as const,
          text: `Here is everything the app knows about querying, read out of the team's own queries.\n\n${catalogueForPrompt(library)}`,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: [{ role: 'user' as const, content: `Today is ${today}.\n\n${description}` }],
      output_config: { format: zodOutputFormat(flexResolutionSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) throw new Error('The model did not return a query specification that could be read.');
    return { resolution: parsed };
  };
}
