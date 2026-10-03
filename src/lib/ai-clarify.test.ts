import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanQuestion, optionLetter, optionReply, questionHistoryText, readClarify } from "./ai-clarify.ts";
import { parseStreamLine } from "./ai-progress.ts";

const block = {
  message: "What should the Python code do? A one-line request is too open to guess well.",
  question: "What kind of Python code do you want?",
  options: [
    { label: "Starter script", description: "Hello-world template with argparse and main()" },
    { label: "Data / file task", description: "Read or write CSV, JSON, or text" },
    { label: "Web / API", description: "Fetch a URL or call an API" },
  ],
  suggestions: ["Learn Python basics", "Write code to scrape a website"],
};

describe("readClarify", () => {
  it("reads a tagged block, fenced or not", () => {
    const tagged = readClarify(`<clarify>${JSON.stringify(block)}</clarify>`);
    assert.equal(tagged.question?.question, block.question);
    assert.equal(tagged.question?.options.length, 3);
    assert.deepEqual(tagged.question?.suggestions, block.suggestions);
    assert.equal(tagged.rest, "");
    const fenced = readClarify(`<clarify>\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\`\n</clarify>`);
    assert.equal(fenced.question?.message, block.message);
  });

  it("reads a bare JSON reply when a model drops the tags", () => {
    assert.equal(readClarify(JSON.stringify(block)).question?.question, block.question);
    assert.equal(readClarify(`\`\`\`json\n${JSON.stringify(block)}\n\`\`\``).question?.options[2]?.label, "Web / API");
  });

  it("leaves normal answers alone, code with JSON included", () => {
    const answer = 'Here is a script:\n\n```python\nprint({"question": 1, "options": []})\n```';
    assert.deepEqual(readClarify(answer), { question: null, rest: answer });
    assert.deepEqual(readClarify("Paris is the capital of France."), { question: null, rest: "Paris is the capital of France." });
  });

  it("drops a broken block instead of showing raw JSON", () => {
    assert.deepEqual(readClarify('Sure. <clarify>{"question": "Which?", "options": [</clarify>'), { question: null, rest: "Sure." });
    assert.deepEqual(readClarify('<clarify>{"question":"Which?","options":[{"label":"Only one"}]}</clarify>'), { question: null, rest: "" });
  });
});

describe("cleanQuestion", () => {
  it("bounds options and suggestions, dedupes, and falls back to the question as the message", () => {
    const many = cleanQuestion({
      question: "  Which   one? ",
      options: ["A", "B", "b", { label: "C", description: "x".repeat(400) }, "D", "E", "F", "G"],
      suggestions: ["one", "one", "two", "three", "four", 5],
    });
    assert.ok(many);
    assert.equal(many.question, "Which one?");
    assert.equal(many.message, "Which one?");
    assert.deepEqual(many.options.map((option) => option.label), ["A", "B", "C", "D", "E"]);
    assert.ok(many.options[2]!.description.length <= 140);
    assert.deepEqual(many.suggestions, ["one", "two", "three"]);
    assert.equal(cleanQuestion({ question: "", options: ["A", "B"] }), null);
    assert.equal(cleanQuestion({ question: "Q", options: "A, B" }), null);
  });
});

describe("question replies and history", () => {
  it("letters options and sends the picked option as a readable message", () => {
    assert.deepEqual([0, 1, 5].map(optionLetter), ["A", "B", "F"]);
    assert.equal(optionReply(block.options[2]!), "Web / API — Fetch a URL or call an API");
    assert.equal(optionReply({ label: "Other", description: "" }), "Other");
  });

  it("puts the question and options in the history so a picked option makes sense", () => {
    const question = cleanQuestion(block)!;
    const text = questionHistoryText(question);
    assert.match(text, /^What should the Python code do\?/);
    assert.match(text, /What kind of Python code do you want\?\nA\. Starter script — /);
    assert.match(text, /C\. Web \/ API — Fetch a URL/);
  });
});

describe("question stream line", () => {
  it("parses a valid question line and ignores a malformed one", () => {
    const line = parseStreamLine(JSON.stringify({ type: "question", question: block }));
    assert.equal(line?.type, "question");
    assert.equal(line?.type === "question" ? line.question.options.length : 0, 3);
    assert.equal(parseStreamLine(JSON.stringify({ type: "question", question: { question: "Q" } })), null);
  });
});
