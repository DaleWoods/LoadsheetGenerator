/**
 * What to do with the zip, once you have it.
 *
 * The app stops at the download and HAC is somebody else's screen, so this is
 * the one place the handover is written down. It is aimed at somebody who has
 * never opened an ImpEx file: the facts come out of the script they are
 * actually holding - the file name, the encoding, how many heading lines are
 * skipped - rather than from a remembered example, because a checklist that
 * describes a different file is worse than none.
 *
 * The HAC steps themselves are deliberately short and free of button names.
 * Naming a control that has since moved teaches people to distrust the rest.
 */

import { readIncludeCall } from '../shared/impex.js';

interface Props {
  impex: string;
  impexFilename: string;
  csvFilename: string | null;
  rowCount: number;
}

export function NextSteps({ impex, impexFilename, csvFilename, rowCount }: Props): JSX.Element {
  const include = readIncludeCall(impex);

  return (
    <div className="next-steps">
      <h3>You have the file. Here is what happens next.</h3>
      <ol className="steps">
        <li>
          <strong>Fill the CSV in, if it is still empty.</strong>{' '}
          {rowCount > 0 ? (
            <>
              It already has {rowCount} row{rowCount === 1 ? '' : 's'}. Add more the same way if you need them.
            </>
          ) : (
            <>Open {csvFilename ?? 'the CSV'} in Excel and put a row in for each record. Leave the greyed columns empty.</>
          )}
          {include ? (
            <>
              {' '}
              Keep the heading row — the script skips {include.linesToSkip} line
              {include.linesToSkip === 1 ? '' : 's'} and would otherwise read your first record as headings. Save it as
              CSV, not as a workbook.
            </>
          ) : null}
        </li>

        {csvFilename ? (
          <li>
            <strong>Upload both files together</strong> in HAC's ImpEx import. The script reads the CSV by name, so{' '}
            <code>{csvFilename}</code> has to keep exactly that name
            {include ? (
              <>
                {' '}
                and be read as <strong>{include.encoding}</strong>, separated by{' '}
                <code>{include.delimiter === '\t' ? 'tab' : include.delimiter}</code>
              </>
            ) : null}
            . Renaming it is the most common reason an import finds nothing.
          </li>
        ) : (
          <li>
            <strong>Paste {impexFilename} into HAC's ImpEx import.</strong> This one carries its rows inside the script,
            so there is no second file.
          </li>
        )}

        <li>
          <strong>Validate before you import.</strong> HAC will check the script without writing anything. A clean
          validation is the last chance to catch a wrong column before it reaches live data.
        </li>

        <li>
          <strong>Come back and say it worked.</strong> Saving this sheet and ticking “it has imported cleanly” is what
          teaches the app which fields are real — it is the only way anything here gets more reliable.
        </li>
      </ol>
      <p className="muted">
        These steps are written from the script, not from HAC itself. If your process differs, say so and they will be
        corrected.
      </p>
    </div>
  );
}
