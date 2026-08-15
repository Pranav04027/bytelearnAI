import fs from "fs";

function parseCsv(text) {
  const rows = [];
  let i = 0;
  const field = () => {
    let s = "";
    if (text[i] === '"') {
      i++;
      while (true) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { s += '"'; i += 2; continue; }
          i++; break;
        }
        if (i >= text.length) break;
        s += text[i]; i++;
      }
    } else {
      while (i < text.length && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") { s += text[i]; i++; }
    }
    return s;
  };
  const skipNL = () => { if (text[i] === "\r") i++; if (text[i] === "\n") i++; };
  const headers = [];
  for (let n = 0; n < 5; n++) { headers.push(field()); if (n < 4 && text[i] === ",") i++; }
  while (i < text.length) {
    skipNL();
    if (i >= text.length) break;
    const row = {};
    for (let n = 0; n < 5; n++) { row[headers[n]] = field(); if (n < 4 && text[i] === ",") i++; }
    rows.push(row);
  }
  return rows;
}

const csvPath = "/home/pranav/projects/ByteLearn/Backend/evals/dataset/transcript_chunks_clean.csv";
const text = fs.readFileSync(csvPath, "utf8");
const rows = parseCsv(text);

const byVideo = {};
for (const r of rows) {
  const v = (byVideo[r.videoId] ||= []);
  v.push({ videoId: r.videoId, chunkIndex: Number(r.chunkIndex), content: r.content, startMs: Number(r.startMs), endMs: Number(r.endMs) });
}
for (const id in byVideo) byVideo[id].sort((a, b) => a.chunkIndex - b.chunkIndex);

const M = ({ id, videoId, question, category, answerable, referenceAnswer, requiredFacts, goldEvidence, notes }) => ({
  id, videoId, question, category, answerable,
  referenceAnswer: referenceAnswer ?? null,
  requiredFacts: requiredFacts ?? [],
  goldEvidence,
  metadata: { notes: notes || NOT },
});
const EVID = (startMs, endMs) => ({ startMs, endMs, text: "" });

const NOT = "AI-generated candidate from frozen ByteLearn transcript snapshot; requires manual gold review.";

const examples = [
// ===== a89e3671 matplotlib-sims (65 chunks) =====
M({ id: "matplotlib-sims-exact_term-001", videoId: "a89e3671-971b-44e4-a3be-c0aa64630c40",
  question: "Which Python module does the instructor use to compute the average and the standard deviation of all the simulation balances?",
  category: "exact_term", answerable: true,
  referenceAnswer: "the statistics module",
  requiredFacts: ["The statistics module provides mean and standard deviation functions", "It is used to print the average and standard deviation of the simulation results"],
  goldEvidence: [
    EVID(1121570, 1145270),
    EVID(1145630, 1177080),
  ] }),
M({ id: "matplotlib-sims-direct-001", videoId: "a89e3671-971b-44e4-a3be-c0aa64630c40",
  question: "What is the purpose of the 'change in balance' function the instructor refactors out of the simulation loop?",
  category: "direct", answerable: true,
  referenceAnswer: "It captures how an investment's balance changes over a single year (e.g. 3% of the current balance), so each loop iteration can update the balance by calling it.",
  requiredFacts: ["The function takes the current balance and returns its change after one year", "The 3% annual increase is one such change", "The simulation loop adds this change to the balance each iteration"],
  goldEvidence: [
    EVID(803360, 829010),
  ] }),
M({ id: "matplotlib-sims-paraphrase-001", videoId: "a89e3671-971b-44e4-a3be-c0aa64630c40",
  question: "Why can't a guaranteed investment like a certificate of deposit demonstrate the kind of randomness the instructor adds to the model?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "A guaranteed investment's return never varies over time, so it cannot produce the random year-to-year fluctuations the model needs.",
  requiredFacts: ["A guaranteed investment's return does not change over time", "Randomness is needed to model fluctuating year-to-year returns"],
  goldEvidence: [
    EVID(853360, 877170),
  ] }),
M({ id: "matplotlib-sims-multi_evidence-001", videoId: "a89e3671-971b-44e4-a3be-c0aa64630c40",
  question: "How do the instructor's stock and bond accounts differ in average return and volatility, and what does the 50/50 mixed account show?",
  category: "multi_evidence", answerable: true,
  referenceAnswer: "Stocks have the highest average returns but fluctuate the most; bonds have smaller gains and losses and a narrower range of outcomes; the 50/50 mixed account falls between them in both average balance and standard deviation.",
  requiredFacts: ["Stocks fluctuate a lot and do best on average", "Bonds have smaller gains and losses", "Bonds have a narrower range of outcomes than stocks", "Stocks have a higher average final balance and higher standard deviation", "The 50/50 mixed account is between stock and bond accounts in mean and standard deviation"],
  goldEvidence: [
    EVID(1178180, 1201730),
    EVID(1309590, 1332020),
    EVID(1364380, 1395910),
    EVID(1280110, 1309210),
  ] }),
M({ id: "matplotlib-sims-unanswerable-001", videoId: "a89e3671-971b-44e4-a3be-c0aa64630c40",
  question: "Which Python GUI framework does the instructor recommend for building desktop windows in this course?",
  category: "unanswerable", answerable: false,
  referenceAnswer: null, requiredFacts: [], goldEvidence: [], notes: NOT }),

// ===== ef4b25b9 monte-carlo (duplicate recording; 1 entry) =====
M({ id: "monte-carlo-paraphrase-001", videoId: "ef4b25b9-6d3b-4039-963a-e1f562b3cece",
  question: "What does a larger standard deviation of final balances tell us about an investment, in the instructor's words?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "It means the investment's outcomes are more volatile — the results are more spread out.",
  requiredFacts: ["Standard deviation measures how spread out the results are", "The larger the standard deviation, the more volatile the investment"],
  goldEvidence: [
    EVID(1145630, 1177080),
  ] }),

// ===== 8683399c xml-json (16 chunks) =====
M({ id: "xml-json-direct-002", videoId: "8683399c-1504-4457-8f21-f951a71f33e5",
  question: "What are the two key rules the instructor mentions on what you can store inside a JSON structure?",
  category: "direct", answerable: true,
  referenceAnswer: "Every key must be a quoted string, and you can only use values like numbers, booleans, strings, or arrays — you cannot store functions.",
  requiredFacts: ["Each JSON key must be a string wrapped in quotes", "You can use numbers, booleans, strings, and arrays as values", "Functions cannot be stored in JSON"],
  goldEvidence: [
    EVID(239580, 270150),
  ] }),
M({ id: "xml-json-paraphrase-001", videoId: "8683399c-1504-4457-8f21-f951a71f33e5",
  question: "Why can JSON be consumed by applications written in languages other than JavaScript?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "JSON is a language-neutral data format — any program can parse it and turn it into its own native objects, not just JavaScript.",
  requiredFacts: ["JSON is not specific to JavaScript", "It can be parsed and turned into native objects by any language", "Examples given include Python and Ruby applications"],
  goldEvidence: [
    EVID(365510, 388470),
  ] }),
M({ id: "xml-json-multi_evidence-001", videoId: "8683399c-1504-4457-8f21-f951a71f33e5",
  question: "Why has JSON mostly replaced XML for exchanging data, and what is one concrete difference the instructor shows between valid JSON and JavaScript?",
  category: "multi_evidence", answerable: true,
  referenceAnswer: "JSON is now the common format most people use for sending data (XML used to be the norm), and unlike JavaScript a JSON object's keys must always be quoted strings, so an unquoted key or a value with single quotes is not valid JSON.",
  requiredFacts: ["JSON is a format for sending data", "XML used to be very common", "Nowadays most people use JSON", "Every JSON key must be a quoted string", "Single quotes are not valid in JSON strings"],
  goldEvidence: [
    EVID(334830, 365330),
    EVID(419680, 451060),
  ] }),

// ===== 8c05dc02 reduce-js (18 chunks) =====
M({ id: "reduce-js-direct-001", videoId: "8c05dc02-d2de-4e8d-bfff-9833470fa2bd",
  question: "In a reduce callback, what do the first and second parameters represent?",
  category: "direct", answerable: true,
  referenceAnswer: "The first parameter is the accumulator/total that holds the running value (the previous return value), and the second parameter is the current value being processed in the array.",
  requiredFacts: ["First parameter is the accumulator that holds the running result", "It carries the previous return value each time", "Second parameter is the current value being processed"],
  goldEvidence: [
    EVID(263519, 292200),
  ] }),
M({ id: "reduce-js-multi_evidence-001", videoId: "8c05dc02-d2de-4e8d-bfff-9833470fa2bd",
  question: "Starting from the first element 3, how does reduce sum the array 3, 5, 7, 9, 11 to a final total of 35?",
  category: "multi_evidence", answerable: true,
  referenceAnswer: "reduce seeds the accumulator with the first element, 3; then it adds 3 to 5 to get 8, 8 to 7 to get 15, 15 to 9 to get 24, and finally 24 to 11 to return 35.",
  requiredFacts: ["The accumulator starts at the first element, 3", "First return: 3 + 5 = 8", "Second return: 8 + 7 = 15", "Third return: 15 + 9 = 24", "Final return: 24 + 11 = 35"],
  goldEvidence: [
    EVID(171860, 204559),
    EVID(204899, 241169),
    EVID(241809, 262688),
  ] }),

// ===== c5b0f316 reduce-maxmin (16 chunks) =====
M({ id: "reduce-maxmin-exact_term-001", videoId: "c5b0f316-a73e-410c-90e4-462ad7174a20",
  question: "What is the term for the optional second argument you can pass to reduce immediately after the callback?",
  category: "exact_term", answerable: true,
  referenceAnswer: "an initial value",
  requiredFacts: ["reduce's callback can be followed by an initial value", "It is passed as the second argument, after the callback"],
  goldEvidence: [
    EVID(352109, 387029),
  ] }),
M({ id: "reduce-maxmin-direct-001", videoId: "c5b0f316-a73e-410c-90e4-462ad7174a20",
  question: "When summing 10, 20, 30, 40, 50 with reduce, what total do you get if you start the accumulator at 0 versus 1000?",
  category: "direct", answerable: true,
  referenceAnswer: "Starting at 0 gives 150; starting at 1000 gives 1150, because reduce adds 10+20+30+40+50 = 150 onto whatever initial value you supplied.",
  requiredFacts: ["Without an initial value, reduce uses the first element", "Passing 0 as the initial value yields 150", "Passing 1000 as the initial value yields 1150"],
  goldEvidence: [
    EVID(426209, 453350),
  ] }),
M({ id: "reduce-maxmin-paraphrase-001", videoId: "c5b0f316-a73e-410c-90e4-462ad7174a20",
  question: "Besides keeping a running max or sum, what other kind of value can reduce accumulate into, that the instructor mentions at the end?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "reduce can accumulate into an object — for example, building up a data object rather than just a number.",
  requiredFacts: ["reduce is not limited to numeric accumulation", "You can specify an object as the initial value", "The initial value does not have to be a number"],
  goldEvidence: [
    EVID(488950, 516570),
  ] }),

// ===== e12a7b28 would-have / third conditional (12 chunks) =====
M({ id: "would-have-exact_term-001", videoId: "e12a7b28-734e-40ca-a864-a9fb59779b65",
  question: "What single word does the instructor repeatedly call the 'magic word' that marks a present unreal conditional as referring to the past?",
  category: "exact_term", answerable: true,
  referenceAnswer: "have",
  requiredFacts: ["'have' is the magic word that marks the past", "\"I would buy it\" talks about now; \"I would have bought it\" talks about the past"],
  goldEvidence: [
    EVID(175870, 222750),
  ] }),
M({ id: "would-have-direct-001", videoId: "e12a7b28-734e-40ca-a864-a9fb59779b65",
  question: "What is the basic grammatical shape the instructor gives for a past unreal condition and its result?",
  category: "direct", answerable: true,
  referenceAnswer: "The result uses 'would have' + past participle, and the if-clause uses 'had' + past participle (e.g., \"I would have bought it if it had not been so expensive\").",
  requiredFacts: ["Result clause uses would have + past participle", "If-clause uses had + past participle", "Example: would have bought it if it had not been so expensive"],
  goldEvidence: [
    EVID(265900, 308900),
  ] }),
M({ id: "would-have-paraphrase-001", videoId: "e12a7b28-734e-40ca-a864-a9fb59779b65",
  question: "Why is inserting 'have' the key to signaling an unreal past situation rather than a present one?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "Adding 'have' after 'would' (and 'had' in the if-clause) moves both the condition and the result into a past time that can no longer be changed, e.g. 'If I had not left the house late, I would have arrived on time.'",
  requiredFacts: ["'have' moves the statement from present to past", "The past is presented as unchangeable", "Example ties the unreal past condition to a consequence"],
  goldEvidence: [
    EVID(175870, 222750),
    EVID(389150, 440020),
  ] }),
M({ id: "would-have-multi_evidence-001", videoId: "e12a7b28-734e-40ca-a864-a9fb59779b65",
  question: "What are the three components of the full conditional form the instructor writes out, and which verb's past participle completes the 'had' clause?",
  category: "multi_evidence", answerable: true,
  referenceAnswer: "The form is I/we/they/he she + would have + past participle, and the past participle completes the 'had' part (had + past participle); the instructor gives 'I would have bought it' as the example.",
  requiredFacts: ["The form starts with would have", "It includes had + past participle in the if-clause", "'I would have bought it' is the worked example"],
  goldEvidence: [
    EVID(265900, 308900),
    EVID(309160, 341760),
    EVID(125150, 175650),
  ] }),

// ===== 02ad6b79 decimals (22 chunks) =====
M({ id: "decimals-direct-001", videoId: "02ad6b79-b765-4293-bb0a-e8771da641a8",
  question: "Why is Papa Bear mistaken that the longest decimal number always means the largest amount?",
  category: "direct", answerable: true,
  referenceAnswer: "Because decimal size is decided by the column values, not the digit count — Baby Bear had the shortest number but the largest amount of porridge.",
  requiredFacts: ["The bears assumed the longest number was the largest", "The shortest number actually represented the largest amount", "Decimal size depends on column value, not digit count"],
  goldEvidence: [
    EVID(256540, 281799),
  ] }),
M({ id: "decimals-paraphrase-001", videoId: "02ad6b79-b765-4293-bb0a-e8771da641a8",
  question: "How does the instructor define a carat when talking about weighing gemstones?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "A carat is a measure of weight (used in gems) equal to 1/5 of a gram, or 200 mg, and a gem's value is determined by its weight.",
  requiredFacts: ["A carat is a measure of weight", "One carat equals 1/5 of a gram or 200 mg", "The value of a stone is determined by its weight"],
  goldEvidence: [
    EVID(589650, 646349),
  ] }),
M({ id: "decimals-multi_evidence-001", videoId: "02ad6b79-b765-4293-bb0a-e8771da641a8",
  question: "When comparing decimals, what columns do you check in order, and how did Amy win 100ths even though her whole minutes matched everyone else?",
  category: "multi_evidence", answerable: true,
  referenceAnswer: "Compare column by column starting with the 10ths, then the 100s, then the 1,000s; Amy's 200 in the 100s column was smaller than the 500 in the other runner's score, which made her faster.",
  requiredFacts: ["Compare from the 10ths column", "Then the 100s column", "Then the 1,000s column", "Amy's 200 in the 100s was less than 500"],
  goldEvidence: [
    EVID(178169, 217270),
    EVID(218460, 255850),
  ] }),

// ===== a4d233ff node-vs-browser (13 chunks) =====
M({ id: "node-vs-browser-exact_term-001", videoId: "a4d233ff-cd7c-429f-b7ad-c81dcba0e068",
  question: "What does the instructor say you lose when you run JavaScript with Node instead of in a browser?",
  category: "exact_term", answerable: true,
  referenceAnswer: "Access to the DOM (the browser's HTML objects and the related Window global).",
  requiredFacts: ["In the browser you get access to the DOM", "In Node there is no DOM", "Node does not manipulate HTML/DOM"],
  goldEvidence: [
    EVID(63400, 86840),
  ] }),
M({ id: "node-vs-browser-unanswerable-001", videoId: "a4d233ff-cd7c-429f-b7ad-c81dcba0e068",
  question: "What npm command does the instructor recommend for listing a package's available versions?",
  category: "unanswerable", answerable: false,
  referenceAnswer: null, requiredFacts: [], goldEvidence: [], notes: NOT }),

// ===== fe839af5 font-awesome (9 chunks) =====
M({ id: "font-awesome-exact_term-001",   videoId: "fe839af5-745c-427f-a787-8540d731cb03",
  question: "What is the name of the free icon library the instructor uses to display the play and pause icons?",
  category: "exact_term", answerable: true,
  referenceAnswer: "Font Awesome",
  requiredFacts: ["Font Awesome is a free icon library", "It provides icons shown via <i> tags"],
  goldEvidence: [
    EVID(1540, 26130),
  ] }),
M({ id: "font-awesome-paraphrase-001", videoId: "fe839af5-745c-427f-a787-8540d731cb03",
  question: "How does the instructor wire the icon library into the project and apply an icon inside a button?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "Copy the library's link from cdnjs.com into a <link rel='stylesheet' href=...> tag in the page head, then paste the <i>...</i> snippet (the eye tag) into the button in place of the text.",
  requiredFacts: ["Get the link from cdnjs.com", "Add a link tag with rel stylesheet and the href", "The source is a CSS file", "Replace the button text with the <i> snippet from the documentation"],
  goldEvidence: [
    EVID(28510, 58720),
    EVID(142590, 174910),
  ] }),

// ===== c1947c90 js-ecmascript terminology (14 chunks) =====
M({ id: "js-ecmascript-exact_term-001", videoId: "c1947c90-3404-4dec-b750-6f71312c4cec",
  question: "What is the name of the annual committee that decides which new features are added to the JavaScript specification?",
  category: "exact_term", answerable: true,
  referenceAnswer: "TC 39",
  requiredFacts: ["TC 39 is a committee at the ECMA organization", "It decides which new features are added to the spec each year"],
  goldEvidence: [
    EVID(170009, 193375),
  ] }),
M({ id: "js-ecmascript-paraphrase-001", videoId: "c1947c90-3404-4dec-b750-6f71312c4cec",
  question: "How did the way JavaScript standard updates were named and released change after ES6 came out?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "Before ES6, new features arrived in big versioned batches (like ES5 and ES6) over many years; after ES6 the committee switched to releasing a new spec every year, named by year — ES 2015 (which equals ES6), ES 2016, and so on.",
  requiredFacts: ["Previously features came in numbered version batches (ES5, ES6)", "After ES6 updates became annual", "Naming switched to the year (ES 2015, ES 2016...)", "ES 2015 is the same as ES6"],
  goldEvidence: [
    EVID(222050, 249070),
    EVID(249449, 280730),
  ] }),
M({ id: "js-ecmascript-unanswerable-001", videoId: "c1947c90-3404-4dec-b750-6f71312c4cec",
  question: "What is the exact date the ECMAScript 2015 specification was published?",
  category: "unanswerable", answerable: false,
  referenceAnswer: null, requiredFacts: [], goldEvidence: [], notes: NOT }),

// ===== 65e733e0 going-to-ghana (10 chunks) =====
M({ id: "going-to-ghana-exact_term-001", videoId: "65e733e0-5f7f-432a-a94c-7c8d5bcda3c8",
  question: "When 'go' is used to talk about moving toward a place, which little word does the instructor say is the essential first part?",
  category: "exact_term", answerable: true,
  referenceAnswer: "to",
  requiredFacts: ["First part of 'go' when going to a place is the word 'to'", "'to' is a preposition of movement", "Examples: go to work, go to school, go to the city center"],
  goldEvidence: [
    EVID(4780, 45460),
  ] }),
M({ id: "going-to-ghana-direct-001", videoId: "65e733e0-5f7f-432a-a94c-7c8d5bcda3c8",
  question: "What two words are the exceptions where you drop 'to' after 'go', and what is the correct form for each?",
  category: "direct", answerable: true,
  referenceAnswer: "home and there — you say 'I'm going home' and 'I'm going there', never 'to go to home' or 'to go to there'.",
  requiredFacts: ["You cannot say 'to go to home'", "You cannot say 'to go to there'", "'I'm going home' is correct", "'I'm going there' is correct"],
  goldEvidence: [
    EVID(45960, 85450),
  ] }),
M({ id: "going-to-ghana-paraphrase-001", videoId: "65e733e0-5f7f-432a-a94c-7c8d5bcda3c8",
  question: "How does the instructor explain the informal word 'gonna' in terms of the words it contains?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "'gonna' is the spoken contraction of 'going to' + a verb; it's used before a verb (like 'do it'), never before a place, and it's for speaking, not writing.",
  requiredFacts: ["'gonna' comes from 'going to' and a verb", "Use it before a verb, not a place", "It is for speaking, not writing"],
  goldEvidence: [
    EVID(260550, 304610),
  ] }),
M({ id: "going-to-ghana-unanswerable-001", videoId: "65e733e0-5f7f-432a-a94c-7c8d5bcda3c8",
  question: "What is the GDP of Ghana in US dollars?",
  category: "unanswerable", answerable: false,
  referenceAnswer: null, requiredFacts: [], goldEvidence: [], notes: NOT }),

// ===== 94661b1f pip-install (9 chunks) =====
M({ id: "pip-install-exact_term-001", videoId: "94661b1f-026a-477e-a56b-5234dd5595bb",
  question: "What is the name of the tool the instructor uses to install third-party Python packages?",
  category: "exact_term", answerable: true,
  referenceAnswer: "pip",
  requiredFacts: ["pip installs third-party packages using Python", "Installed via 'pip install <name>'"],
  goldEvidence: [
    EVID(939, 28979),
  ] }),
M({ id: "pip-install-direct-001", videoId: "94661b1f-026a-477e-a56b-5234dd5595bb",
  question: "What command does the instructor run to confirm pip is installed and show its version?",
  category: "direct", answerable: true,
  referenceAnswer: "pip -V",
  requiredFacts: ["pip -V prints pip's version", "It also shows where pip is being used"],
  goldEvidence: [
    EVID(30719, 58409),
  ] }),
M({ id: "pip-install-paraphrase-001", videoId: "94661b1f-026a-477e-a56b-5234dd5595bb",
  question: "If Python didn't come with pip, what steps does the instructor walk through to get it onto your machine?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "Download the get-pip.py installer with curl from the bootstrap URL, then run 'python get-pip.py' to install pip.",
  requiredFacts: ["Fetch get-pip.py with curl", "Run 'python get-pip.py' to install", "The URL is bootstrap.pypa.io/get-pip.py"],
  goldEvidence: [
    EVID(89410, 135960),
  ] }),

// ===== 801bdbd6 requests-http (10 chunks) =====
M({ id: "requests-http-exact_term-001", videoId: "801bdbd6-884f-4a63-9a7b-cf2ab9740fea",
  question: "Which Python package does the instructor import to make a web request?",
  category: "exact_term", answerable: true,
  referenceAnswer: "requests",
  requiredFacts: ["The requests package is used for requests", "Imported with 'import requests'"],
  goldEvidence: [
    EVID(289, 31690),
  ] }),
M({ id: "requests-http-direct-001", videoId: "801bdbd6-884f-4a63-9a7b-cf2ab9740fea",
  question: "What does an HTTP status code of 200 tell us about a website?",
  category: "direct", answerable: true,
  referenceAnswer: "The site is up and running.",
  requiredFacts: ["200 is an HTTP status code", "A 200 response means the site is up and running"],
  goldEvidence: [
    EVID(117860, 158800),
  ] }),
M({ id: "requests-http-paraphrase-001", videoId: "801bdbd6-884f-4a63-9a7b-cf2ab9740fea",
  question: "How does the instructor turn a one-off request into a continuous uptime monitor?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "Loop forever, sleeping about 60 seconds between requests, and if the status code is not 200, trigger an email or text alert; stop it later with control C.",
  requiredFacts: ["Wait roughly 60 seconds between requests", "Alert (email/text) when status code != 200", "Stop with control C"],
  goldEvidence: [
    EVID(192649, 227949),
    EVID(228429, 258989),
  ] }),

// ===== 0ba7fe5a array-callbacks (6 chunks) =====
M({ id: "array-callbacks-exact_term-001", videoId: "0ba7fe5a-525f-4d35-8874-d6b32a365290",
  question: "Which built-in array methods that take a callback does the instructor list in this lesson?",
  category: "exact_term", answerable: true,
  referenceAnswer: "map, filter, find, reduce, sum, and every",
  requiredFacts: ["The methods are map, filter, find, reduce, sum, and every", "Each takes a callback function"],
  goldEvidence: [
    EVID(100160, 125730),
  ] }),
M({ id: "array-callbacks-direct-001", videoId: "0ba7fe5a-525f-4d35-8874-d6b32a365290",
  question: "Why does the instructor say callbacks are central to JavaScript?",
  category: "direct", answerable: true,
  referenceAnswer: "Because many built-in JavaScript methods — especially array methods — expect you to pass them a callback function that they will call for you.",
  requiredFacts: ["Callbacks are central to JavaScript", "Tons of built-in methods expect a callback function"],
  goldEvidence: [
    EVID(50, 19569),
  ] }),
M({ id: "array-callbacks-paraphrase-001", videoId: "0ba7fe5a-525f-4d35-8874-d6b32a365290",
  question: "What benefit do arrow functions give when you need to pass a function into an array method?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "They are shorter, cleaner, and easier to write inline as arguments.",
  requiredFacts: ["Arrow functions are shorter and cleaner", "They are easier to pass in as an argument"],
  goldEvidence: [
    EVID(100160, 125730),
  ] }),

// ===== 21050cf2 chrome-vscode (7 chunks) =====
M({ id: "chrome-vscode-direct-001", videoId: "21050cf2-b0ab-402b-a195-e6eb14049634",
  question: "How do you get Chrome and why does the instructor recommend using the same browser he uses?",
  category: "direct", answerable: true,
  referenceAnswer: "Download it from google.com/Chrome; using the same browser the instructor uses makes it easier to follow along with the dev tools discussed later.",
  requiredFacts: ["Download Chrome from google.com/Chrome", "Using Chrome makes it easier to follow the dev tools"],
  goldEvidence: [
    EVID(44830, 66360),
  ] }),
M({ id: "chrome-vscode-exact_term-001", videoId: "21050cf2-b0ab-402b-a195-e6eb14049634",
  question: "What is the full name of the code editor the instructor recommends?",
  category: "exact_term", answerable: true,
  referenceAnswer: "Visual Studio Code (VS Code)",
  requiredFacts: ["VS Code stands for Visual Studio Code", "It is free and developed by Microsoft"],
  goldEvidence: [
    EVID(91889, 109970),
  ] }),
M({ id: "chrome-vscode-unanswerable-001", videoId: "21050cf2-b0ab-402b-a195-e6eb14049634",
  question: "Which version of VS Code introduced the built-in terminal?",
  category: "unanswerable", answerable: false,
  referenceAnswer: null, requiredFacts: [], goldEvidence: [], notes: NOT }),

// ===== 0c790b52 mdn-docs (6 chunks) =====
M({ id: "mdn-docs-exact_term-001", videoId: "0c790b52-9520-4feb-af33-1671b4a5061e",
  question: "What website does the instructor call the closest thing to official JavaScript documentation?",
  category: "exact_term", answerable: true,
  referenceAnswer: "MDN (Mozilla Developer Network), at developer.mozilla.org",
  requiredFacts: ["MDN is the closest thing to official JavaScript docs", "The address is developer.mozilla.org"],
  goldEvidence: [
    EVID(170, 12850),
  ] }),
M({ id: "mdn-docs-direct-001", videoId: "0c790b52-9520-4feb-af33-1671b4a5061e",
  question: "Why can JavaScript not have a single official documentation site the way Python has python.org?",
  category: "direct", answerable: true,
  referenceAnswer: "Because JavaScript is not a single downloadable product — it is the ECMAScript specification implemented separately by each browser, so no single vendor owns one canonical reference.",
  requiredFacts: ["There is no single JavaScript to download", "It is implemented by browsers from one spec", "Unlike Python there is no unified official site"],
  goldEvidence: [
    EVID(13380, 41389),
  ] }),
M({ id: "mdn-docs-paraphrase-001", videoId: "0c790b52-9520-4feb-af33-1671b4a5061e",
  question: "How does the instructor combine Google with MDN when they can't remember a JavaScript method name?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "They type the concept into Google followed by 'MDN', so the search results come from the MDN documentation.",
  requiredFacts: ["Type the concept into Google", "Add 'MDN' to the search", "Results come from MDN documentation"],
  goldEvidence: [
    EVID(41709, 70220),
  ] }),

// ===== e4c82d42 fractions-decimals (24 chunks) =====
M({ id: "fractions-decimals-exact_term-001", videoId: "e4c82d42-c96a-41c9-aa61-2481e3538af0",
  question: "What does the instructor call a decimal that eventually ends in zeros, and what must a fraction's denominator be for it to convert into that kind?",
  category: "exact_term", answerable: true,
  referenceAnswer: "A terminating decimal; the fraction's denominator must be changeable into a power of 10.",
  requiredFacts: ["A terminating decimal eventually ends in zeros", "The fraction's denominator must be a power of 10", "Then it is easy to convert into a decimal"],
  goldEvidence: [
    EVID(478540, 508929),
  ] }),
M({ id: "fractions-decimals-exact_term-002", videoId: "e4c82d42-c96a-41c9-aa61-2481e3538af0",
  question: "When converting fractions to decimals, what kind of denominator does the instructor say makes the job easiest?",
  category: "exact_term", answerable: true,
  referenceAnswer: "A denominator that is a power of 10 (10, 100, 1000, ...).",
  requiredFacts: ["Powers of 10 make conversion easiest", "Multiply numerator and denominator to reach a power of 10", "1/5 becomes 2/10"],
  goldEvidence: [
    EVID(157800, 199690),
  ] }),
M({ id: "fractions-decimals-multi_evidence-001", videoId: "e4c82d42-c96a-41c9-aa61-2481e3538af0",
  question: "How does the instructor check the decimal for 3/4, and why can 1/3 never be written as that kind?",
  category: "multi_evidence", answerable: true,
  referenceAnswer: "For 3/4 she scales to 100 (3/4 = 75/100 = 0.75) and checks it on the calculator; 1/3 can never become a terminating decimal because no whole number multiplied by 3 gives a power of 10 as a denominator.",
  requiredFacts: ["3/4 = 75/100 = 0.75, checked on the calculator", "1/3 is a non-terminating decimal", "No whole number times 3 equals a power of 10"],
  goldEvidence: [
    EVID(512150, 594349),
    EVID(599650, 634760),
  ] }),

// ===== ac116d4c area of a rectangle (19 chunks) =====
M({ id: "rectangle-area-direct-001", videoId: "ac116d4c-6436-4ffc-a979-3f09fa649bd5",
  question: "What formula does Shirley and Bobby's rival use to find the area of Mr. Freeman's 12-by-8 lawn?",
  category: "direct", answerable: true,
  referenceAnswer: "A equals L times W (length times width); for 12 by 8 that is 12 x 8 = 96 square meters.",
  requiredFacts: ["The area formula is length times width", "A equals L times W", "12 times 8 gives 96 square meters"],
  goldEvidence: [
    EVID(735869, 815859),
  ] }),
M({ id: "rectangle-area-formula-paraphrase-001", videoId: "ac116d4c-6436-4ffc-a979-3f09fa649bd5",
  question: "Why does the instructor say you measure area in square units like square meters rather than just meters?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "Area covers a two-dimensional surface, so you measure how many unit squares it takes to cover it rather than just a one-dimensional length in meters.",
  requiredFacts: ["Area is the amount of surface covered", "You measure in square units", "A square meter covers a surface, unlike a plain meter"],
  goldEvidence: [
    EVID(190830, 227679),
  ] }),
M({ id: "rectangle-area-multi_evidence-001", videoId: "ac116d4c-6436-4ffc-a979-3f09fa649bd5",
  question: "How does Buddy Biggs calculate the lawn's area without laying out every square meter, and what result does he get?",
  category: "multi_evidence", answerable: true,
  referenceAnswer: "He counts the squares along one side (12) and the rows along the top (8) and multiplies them (12 x 8 = 96 square meters), using the length-times-width formula instead of physically covering the ground.",
  requiredFacts: ["Count the squares along one side (12)", "Count the rows along the top (8)", "Multiply 12 by 8 to get 96 square meters", "This uses the length-times-width formula"],
  goldEvidence: [
    EVID(701330, 735619),
    EVID(735869, 815859),
  ] }),
M({ id: "rectangle-area-multi_evidence-002", videoId: "ac116d4c-6436-4ffc-a979-3f09fa649bd5",
  question: "How do Shirley and Bobby measure area by counting squares, including squares that are only partly covered?",
  category: "multi_evidence", answerable: true,
  referenceAnswer: "They cover the surface with unit squares and count the number of whole squares or parts of squares it takes to cover it, as shown when measuring along the lawn and adding rows.",
  requiredFacts: ["You can count the number of squares that cover a surface", "You can also count parts of squares", "They measured one row then another row and added them"],
  goldEvidence: [
    EVID(277779, 333839),
    EVID(447950, 486899),
  ] }),
M({ id: "rectangle-area-unanswerable-001", videoId: "ac116d4c-6436-4ffc-a979-3f09fa649bd5",
  question: "What is the total number of books in Mother Witch's library of magic spells?",
  category: "unanswerable", answerable: false,
  referenceAnswer: null, requiredFacts: [], goldEvidence: [], notes: NOT }),

// ===== fce685d4 promises in JavaScript (24 chunks) =====
M({ id: "promises-js-direct-001", videoId: "fce685d4-7eed-42e2-93c7-a0e78d8efb37",
  question: "How does the instructor create a promise that resolves about half the time and rejects the other half?",
  category: "direct", answerable: true,
  referenceAnswer: "He sets const rand = Math.random(), then if rand < 0.5 he calls resolve(), otherwise he calls reject().",
  requiredFacts: ["Use Math.random() to pick a random number", "If rand is less than 0.5, call resolve", "Otherwise call reject"],
  goldEvidence: [
    EVID(432770, 467920),
  ] }),
M({ id: "promises-js-paraphrase-001", videoId: "fce685d4-7eed-42e2-93c7-a0e78d8efb37",
  question: "How does the instructor explain what the then and catch methods on a promise do?",
  category: "paraphrase", answerable: true,
  referenceAnswer: "The then method runs its callback when the promise is resolved, and the catch method runs its callback when the promise is rejected.",
  requiredFacts: ["Every promise has a then method", "then runs if the promise is resolved", "catch runs if the promise is rejected"],
  goldEvidence: [
    EVID(468140, 506610),
  ] }),
M({ id: "promises-js-multi_evidence-001", videoId: "fce685d4-7eed-42e2-93c7-a0e78d8efb37",
  question: "What real-world analogy does the instructor use to explain what a JavaScript promise is, and what formal definition does he give?",
  category: "multi_evidence", answerable: true,
  referenceAnswer: "He compares it to his father promising a dog if he got good grades (an eventual, possibly-kept-or-broken guarantee), and defines a promise as a JavaScript object that represents the eventual success or failure of some task that takes time.",
  requiredFacts: ["The dog-promise analogy: a promise of an eventual value that may or may not be fulfilled", "A promise is an object representing eventual completion or failure", "It represents a task that takes time, like an HTTP request"],
  goldEvidence: [
    EVID(147080, 173940),
    EVID(174320, 202840),
  ] }),
M({ id: "promises-js-multi_evidence-002", videoId: "fce685d4-7eed-42e2-93c7-a0e78d8efb37",
  question: "How does the instructor demonstrate that a resolved promise triggers then and a rejected promise triggers catch?",
  category: "multi_evidence", answerable: true,
  referenceAnswer: "He attaches a then callback (e.g. logging 'yay we got a dog') and a catch callback (e.g. logging a sad 'no dog'), then shows that each refresh runs only the matching callback depending on whether the promise resolved or rejected.",
  requiredFacts: ["then callback runs when the promise resolves", "catch callback runs when the promise rejects", "He logs different messages for each case", "Only the matching callback runs on each refresh"],
  goldEvidence: [
    EVID(468140, 506610),
    EVID(509150, 542810),
  ] }),
M({ id: "promises-js-unanswerable-001", videoId: "fce685d4-7eed-42e2-93c7-a0e78d8efb37",
  question: "In what year was the Promises/A+ specification finalized?",
  category: "unanswerable", answerable: false,
  referenceAnswer: null, requiredFacts: [], goldEvidence: [], notes: NOT }),

// ===== feb287e6 german self-intro (2 chunks, incomprehensible German only) =====
M({ id: "german-intro-unanswerable-001", videoId: "feb287e6-4f87-40bb-9af6-a3ee4d6479d0",
  question: "What is the role of the reduce array method in JavaScript?",
  category: "unanswerable", answerable: false,
  referenceAnswer: null, requiredFacts: [], goldEvidence: [], notes: NOT }),
];

// ---- normalize: fill goldEvidence.text from the matched CSV chunk (guarantees exact provenance) ----
for (const ex of examples) {
  for (const ge of (ex.goldEvidence || [])) {
    const match = (byVideo[ex.videoId] || []).find((c) => c.startMs === ge.startMs && c.endMs === ge.endMs);
    if (match) ge.text = match.content;
  }
}

// ---- validation ----
const errors = [];
const seenIds = new Set();
for (const ex of examples) {
  if (seenIds.has(ex.id)) errors.push(`duplicate id: ${ex.id}`);
  seenIds.add(ex.id);
  if (!ex.videoId || !(ex.videoId in byVideo)) errors.push(`${ex.id}: videoId not in CSV`);
  if (!["direct","paraphrase","exact_term","multi_evidence","unanswerable"].includes(ex.category)) errors.push(`${ex.id}: bad category ${ex.category}`);
  if (ex.answerable) {
    if (!ex.referenceAnswer) errors.push(`${ex.id}: answerable but null referenceAnswer`);
    if (!ex.requiredFacts || ex.requiredFacts.length < 1) errors.push(`${ex.id}: answerable but no requiredFacts`);
    if (!ex.goldEvidence || ex.goldEvidence.length < 1) errors.push(`${ex.id}: answerable but no goldEvidence`);
    if (ex.category === "multi_evidence" && ex.goldEvidence.length < 2) errors.push(`${ex.id}: multi_evidence needs >=2 spans`);
  } else {
    if (ex.referenceAnswer !== null) errors.push(`${ex.id}: unanswerable but referenceAnswer not null`);
    if (ex.requiredFacts?.length) errors.push(`${ex.id}: unanswerable should have empty requiredFacts`);
    if (ex.goldEvidence?.length) errors.push(`${ex.id}: unanswerable should have empty goldEvidence`);
  }
  for (const ge of (ex.goldEvidence || [])) {
    const n = Number(ge.startMs), e = Number(ge.endMs);
    if (!Number.isFinite(n) || !Number.isFinite(e)) errors.push(`${ex.id}: startMs/endMs not numbers`);
    if (n > e) errors.push(`${ex.id}: startMs > endMs`);
    const vchunks = byVideo[ex.videoId] || [];
    const match = vchunks.find((c) => c.startMs === n && c.endMs === e);
    if (!match) errors.push(`${ex.id}: no CSV chunk with startMs=${n} endMs=${e}`);
    if (match && ge.text && !match.content.includes(ge.text)) errors.push(`${ex.id}: evidence text not substring of chunk (startMs=${n})`);
  }
}

// every usable video should have >=1 answerable example (German self-intro is a known exception)
const answerableByVideo = {};
for (const ex of examples) if (ex.answerable) (answerableByVideo[ex.videoId] ||= 0), answerableByVideo[ex.videoId]++;
const UNANSWERABLE_ONLY_OK = new Set(["feb287e6-4f87-40bb-9af6-a3ee4d6479d0"]);
for (const v of Object.keys(byVideo)) {
  if (!answerableByVideo[v]) {
    if (!UNANSWERABLE_ONLY_OK.has(v)) errors.push(`video ${v.slice(0,8)} has no answerable example`);
  }
}

const cat = {}; const vidCount = {};
for (const ex of examples) { cat[ex.category] = (cat[ex.category]||0)+1; vidCount[ex.videoId] = (vidCount[ex.videoId]||0)+1; }

console.log("authored examples:", examples.length);
console.log("by category:", JSON.stringify(cat));
console.log("examples per video:", vidCount);
console.log("errors:", errors.length);
if (errors.length) { console.error(JSON.stringify(errors, null, 2)); process.exit(1); }

fs.writeFileSync("/home/pranav/projects/ByteLearn/Backend/evals/dataset/examples.json", JSON.stringify(examples, null, 2));
console.log("wrote examples.json");
