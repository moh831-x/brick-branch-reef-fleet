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

  it("asks the same place questions for other countries", () => {
    for (const name of ["japan", "nigeria", "brazil", "south korea", "united states", "côte d'ivoire", "bosnia and herzegovina"]) {
      const questions = relatedQuestions(name, "en-US");
      assert.equal(questions[0]?.startsWith("Where is "), true, name);
      assert.match(questions[1] ?? "", /capital/i, name);
      assert.equal(
        questions.some((question) => /^who is/i.test(question)),
        false,
        name,
      );
    }
    assert.equal(relatedQuestions("usa", "en-US")[0], "Where is the USA?");
    assert.equal(relatedQuestions("côte d'ivoire", "en-US")[0], "Where is Côte d'Ivoire?");
  });

  it("asks where a located city is", () => {
    const questions = relatedQuestions("dhaka", "en-US", [], ["Dhaka"]);
    assert.equal(questions[0], "Where is Dhaka?");
    assert.equal(
      questions.some((question) => /who is/i.test(question)),
      false,
    );
  });

  it("drops a question already asked in the chat and offers the next one", () => {
    const questions = relatedQuestions("Bernie Sanders", "en-US", [], [], ["What is Bernie Sanders known for?"]);
    assert.equal(questions.includes("What is Bernie Sanders known for?"), false);
    assert.deepEqual(questions, [
      "What is the latest on Bernie Sanders?",
      "What else matters about Bernie Sanders?",
      "What do the sources disagree on about Bernie Sanders?",
    ]);
  });

  it("does not ask who a graph is", () => {
    assert.deepEqual(relatedQuestions("graph of x^2", "en-US"), []);
  });
});
