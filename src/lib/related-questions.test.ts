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

  it("asks where a country is, not who it is", () => {
    const questions = relatedQuestions("bangladesh", "en-US");
    assert.deepEqual(questions, [
      "Where is Bangladesh?",
      "What is the capital of Bangladesh?",
      "What is Bangladesh known for?",
    ]);
  });

  it("asks where a located city is", () => {
    const questions = relatedQuestions("dhaka", "en-US", [], ["Dhaka"]);
    assert.equal(questions[0], "Where is Dhaka?");
    assert.equal(
      questions.some((question) => /who is/i.test(question)),
      false,
    );
  });

  it("does not ask who a graph is", () => {
    assert.deepEqual(relatedQuestions("graph of x^2", "en-US"), []);
  });
});
