import fs from 'fs';

const GOLD_PATH = 'evals/dataset/gold.json';
const TRANSCRIPT_PATH = 'evals/dataset/transcript_chunks_clean.csv';

const VALID_CATEGORIES = new Set([
  'direct',
  'paraphrase',
  'exact_term',
  'multi_evidence',
  'unanswerable',
]);

// Freeze-time guard. Remove this block later if the benchmark is intentionally expanded.
const EXPECTED_COUNTS = {
  direct: 12,
  paraphrase: 15,
  exact_term: 14,
  multi_evidence: 12,
  unanswerable: 8,
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...data] = rows;
  if (!header) return [];

  return data
    .filter((r) => r.some((value) => value !== ''))
    .map((r) =>
      Object.fromEntries(
        header.map((key, index) => [key, r[index] ?? ''])
      )
    );
}

function fail(errors, message) {
  errors.push(message);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function runValidation() {
  const errors = [];
  const warnings = [];

  const examples = JSON.parse(
    fs.readFileSync(GOLD_PATH, 'utf8')
  );

  const transcriptRows = parseCsv(
    fs.readFileSync(TRANSCRIPT_PATH, 'utf8')
  ).map((row) => ({
    ...row,
    chunkIndex: Number(row.chunkIndex),
    startMs: Number(row.startMs),
    endMs: Number(row.endMs),
  }));

  if (!Array.isArray(examples)) {
    throw new Error('gold.json must contain a JSON array.');
  }

  const transcriptVideoIds = new Set(
    transcriptRows.map((row) => row.videoId)
  );

  const transcriptByRange = new Map(
    transcriptRows.map((row) => [
      `${row.videoId}|${row.startMs}|${row.endMs}`,
      row,
    ])
  );

  // Frozen transcript sanity.
  if (transcriptRows.length !== 367) {
    warnings.push(
      `Frozen transcript row count is ${transcriptRows.length}; expected 367 for Gold v1 snapshot.`
    );
  }

  for (const row of transcriptRows) {
    if (!isNonEmptyString(row.videoId)) {
      fail(errors, 'Transcript row has empty videoId.');
    }

    if (!Number.isInteger(row.chunkIndex)) {
      fail(
        errors,
        `Transcript row has invalid chunkIndex for ${row.videoId}.`
      );
    }

    if (
      !Number.isInteger(row.startMs) ||
      !Number.isInteger(row.endMs)
    ) {
      fail(
        errors,
        `Transcript row has non-integer timestamps for ${row.videoId} chunk ${row.chunkIndex}.`
      );
    } else if (row.startMs > row.endMs) {
      fail(
        errors,
        `Transcript row has startMs > endMs for ${row.videoId} chunk ${row.chunkIndex}.`
      );
    }

    if (!isNonEmptyString(row.content)) {
      fail(
        errors,
        `Transcript row has empty content for ${row.videoId} chunk ${row.chunkIndex}.`
      );
    }
  }

  // Unique IDs + schema/shape checks.
  const ids = new Set();

  const categoryCounts = Object.fromEntries(
    [...VALID_CATEGORIES].map((category) => [category, 0])
  );

  for (const ex of examples) {
    if (
      !ex ||
      typeof ex !== 'object' ||
      Array.isArray(ex)
    ) {
      fail(errors, 'Every gold example must be an object.');
      continue;
    }

    if (!isNonEmptyString(ex.id)) {
      fail(errors, 'Example has an empty or missing id.');
    } else if (ids.has(ex.id)) {
      fail(errors, `Duplicate id: ${ex.id}`);
    } else {
      ids.add(ex.id);
    }

    const label = ex.id || '<missing-id>';

    if (!isNonEmptyString(ex.videoId)) {
      fail(
        errors,
        `${label}: videoId must be a non-empty string.`
      );
    } else if (!transcriptVideoIds.has(ex.videoId)) {
      fail(
        errors,
        `${label}: videoId not found in frozen transcript snapshot.`
      );
    }

    if (!isNonEmptyString(ex.question)) {
      fail(
        errors,
        `${label}: question must be a non-empty string.`
      );
    }

    if (!VALID_CATEGORIES.has(ex.category)) {
      fail(
        errors,
        `${label}: invalid category ${JSON.stringify(ex.category)}.`
      );
    } else {
      categoryCounts[ex.category] += 1;
    }

    if (typeof ex.answerable !== 'boolean') {
      fail(
        errors,
        `${label}: answerable must be boolean.`
      );
    }

    if (!Array.isArray(ex.requiredFacts)) {
      fail(
        errors,
        `${label}: requiredFacts must be an array.`
      );
    }

    if (!Array.isArray(ex.goldEvidence)) {
      fail(
        errors,
        `${label}: goldEvidence must be an array.`
      );
    }

    if (Array.isArray(ex.requiredFacts)) {
      ex.requiredFacts.forEach((fact, index) => {
        if (!isNonEmptyString(fact)) {
          fail(
            errors,
            `${label}: requiredFacts[${index}] must be a non-empty string.`
          );
        }
      });
    }

    if (ex.answerable === true) {
      if (!isNonEmptyString(ex.referenceAnswer)) {
        fail(
          errors,
          `${label}: answerable example must have a non-empty referenceAnswer.`
        );
      }

      if (
        !Array.isArray(ex.requiredFacts) ||
        ex.requiredFacts.length === 0
      ) {
        fail(
          errors,
          `${label}: answerable example must have requiredFacts.`
        );
      }

      if (
        !Array.isArray(ex.goldEvidence) ||
        ex.goldEvidence.length === 0
      ) {
        fail(
          errors,
          `${label}: answerable example must have goldEvidence.`
        );
      }
    }

    if (ex.answerable === false) {
      if (ex.referenceAnswer !== null) {
        fail(
          errors,
          `${label}: unanswerable example must have referenceAnswer === null.`
        );
      }

      if (
        !Array.isArray(ex.requiredFacts) ||
        ex.requiredFacts.length !== 0
      ) {
        fail(
          errors,
          `${label}: unanswerable example must have requiredFacts === [].`
        );
      }

      if (
        !Array.isArray(ex.goldEvidence) ||
        ex.goldEvidence.length !== 0
      ) {
        fail(
          errors,
          `${label}: unanswerable example must have goldEvidence === [].`
        );
      }
    }

    if (
      ex.category === 'multi_evidence' &&
      Array.isArray(ex.goldEvidence) &&
      ex.goldEvidence.length < 2
    ) {
      fail(
        errors,
        `${label}: multi_evidence example must contain at least two evidence spans.`
      );
    }

    if (Array.isArray(ex.goldEvidence)) {
      const seenEvidence = new Set();

      ex.goldEvidence.forEach((evidence, index) => {
        if (
          !evidence ||
          typeof evidence !== 'object' ||
          Array.isArray(evidence)
        ) {
          fail(
            errors,
            `${label}: goldEvidence[${index}] must be an object.`
          );
          return;
        }

        if (
          !Number.isInteger(evidence.startMs) ||
          !Number.isInteger(evidence.endMs)
        ) {
          fail(
            errors,
            `${label}: goldEvidence[${index}] timestamps must be integers.`
          );
          return;
        }

        if (evidence.startMs > evidence.endMs) {
          fail(
            errors,
            `${label}: goldEvidence[${index}] has startMs > endMs.`
          );
        }

        if (!isNonEmptyString(evidence.text)) {
          fail(
            errors,
            `${label}: goldEvidence[${index}].text must be non-empty.`
          );
        }

        const rangeKey =
          `${ex.videoId}|${evidence.startMs}|${evidence.endMs}`;

        if (seenEvidence.has(rangeKey)) {
          fail(
            errors,
            `${label}: duplicate gold evidence range ${evidence.startMs}-${evidence.endMs}.`
          );
        }

        seenEvidence.add(rangeKey);

        const sourceRow = transcriptByRange.get(rangeKey);

        if (!sourceRow) {
          fail(
            errors,
            `${label}: evidence ${evidence.startMs}-${evidence.endMs} does not exist for the target video in the frozen snapshot.`
          );
        } else if (sourceRow.content !== evidence.text) {
          fail(
            errors,
            `${label}: evidence text does not exactly match the frozen transcript for ${evidence.startMs}-${evidence.endMs}.`
          );
        }
      });
    }

    if (ex.metadata !== undefined) {
      if (
        !ex.metadata ||
        typeof ex.metadata !== 'object' ||
        Array.isArray(ex.metadata)
      ) {
        fail(
          errors,
          `${label}: metadata must be an object when present.`
        );
      } else if (
        ex.metadata.notes !== undefined &&
        !isNonEmptyString(ex.metadata.notes)
      ) {
        fail(
          errors,
          `${label}: metadata.notes must be a non-empty string when present.`
        );
      }
    }
  }

  // Freeze-time distribution guard.
  for (const [category, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (categoryCounts[category] !== expected) {
      fail(
        errors,
        `Category count mismatch for ${category}: expected ${expected}, found ${categoryCounts[category]}.`
      );
    }
  }

  if (examples.length !== 61) {
    fail(
      errors,
      `Expected 61 Gold v1 examples, found ${examples.length}.`
    );
  }

  const lines = [
    `Gold examples: ${examples.length}`,
    `Frozen transcript rows: ${transcriptRows.length}`,
    `Unique IDs: ${ids.size === examples.length ? 'PASS' : 'FAIL'}`,
    `Category counts: ${JSON.stringify(categoryCounts)}`,
    `Deterministic validation: ${errors.length === 0 ? 'PASS' : 'FAIL'}`,
    '',
    'Semantic checks (question naturalness, category correctness, answer support, required-fact necessity, and whether multi-evidence truly requires multiple spans) are intentionally NOT hard-coded as PASS. They require semantic/manual review.',
  ];

  if (warnings.length > 0) {
    lines.push(
      '',
      'Warnings:',
      ...warnings.map((warning) => `- ${warning}`)
    );
  }

  if (errors.length > 0) {
    lines.push(
      '',
      'Errors:',
      ...errors.map((error) => `- ${error}`)
    );
  }

  const report = lines.join('\n');

  fs.writeFileSync(
    'evals/dataset/validation_report.txt',
    report
  );

  console.log(report);

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

runValidation();
