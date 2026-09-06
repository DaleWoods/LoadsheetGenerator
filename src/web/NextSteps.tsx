/**
 * What is true about the file you have just taken.
 *
 * This started as a four-step HAC walkthrough, written on the assumption that
 * the reader might not have imported one before. They have. Telling somebody
 * who writes ImpEx to validate before importing is noise, and noise next to
 * the one line that matters is what stops the line being read.
 *
 * What is left is only what is specific to *this* file and could catch
 * somebody out: the two names that have to stay as they are, the offset the
 * CSV was built for, and the tick that turns a sheet into evidence. Every fact
 * is read back out of the generated script rather than remembered, because a
 * note describing a different file is worse than none.
 */

import { readIncludeCall } from '../shared/impex.js';

interface Props {
  impex: string;
  impexFilename: string;
  csvFilename: string | null;
}

export function NextSteps({ impex, impexFilename, csvFilename }: Props): JSX.Element {
  const include = readIncludeCall(impex);

  return (
    <div className="next-steps">
      <h3>In the zip</h3>
      <ul className="facts">
        <li>
          <code>{impexFilename}</code>
          {csvFilename ? (
            <>
              {' '}
              and <code>{csvFilename}</code>. The script reads the CSV by name, so it has to keep that one.
            </>
          ) : (
            <> — the rows are inside the script, so there is no second file.</>
          )}
        </li>
        {include ? (
          <li>
            Written for <strong>{include.encoding}</strong>,{' '}
            <code>{include.delimiter === '\t' ? 'tab' : include.delimiter}</code>-separated,{' '}
            <strong>columnsOffset {include.columnsOffset}</strong>
            {include.columnsOffset === 0
              ? ' — the CSV has the leading blank type column, so keep it when you edit.'
              : ' — the CSV has no leading type column, so do not add one.'}
          </li>
        ) : null}
        <li>
          If it imports cleanly, say so below. That is what promotes the sheet to evidence and stops its fields being
          flagged unverified next time.
        </li>
      </ul>
    </div>
  );
}
