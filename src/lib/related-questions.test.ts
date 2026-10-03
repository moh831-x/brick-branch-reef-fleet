import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { relatedQuestions } from "./related-questions.ts";

describe("related questions", () => {
  it("asks about a person, and uses a related search when it knows the shape", () => {
    const questions = relatedQuestions("Tarique Rahman", "en-US", ["Tarique Rahman wife", "Tarique Rahman news"]);
    assert.equal(questions[0], "Who is Tarique Rahman's wife?");
    assert.equal(questions[1], "What is the latest news about Tarique Rahman?");
    assert.equal(questions.length, 3);
    assert.match(questions[2] ?? "", /Tarique Rahman/);
  });

  it("does not ask who a graph is", () => {
    assert.deepEqual(relatedQuestions("graph of x^2", "en-US"), []);
  });
});
