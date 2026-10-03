import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { answerBlocks, groupCites, hasBullets } from "./answer-blocks.ts";
import { parseAiAnswer, type AiContextItem } from "./ai.shared.ts";

const context: AiContextItem[] = [
  { source: "web", title: "Iran readies retaliation", url: "https://www.reuters.com/a", snippet: "a", site: "Reuters", date: "Oct 2, 2026" },
  { source: "web", title: "Talks stall", url: "https://apnews.com/b", snippet: "b" },
];

const news = [
  "Here are the main Iran developments as of **October 2, 2026**:",
  "- **Tensions remain very high.** Iran is preparing broader retaliation [1].",
  "- **Talks are stalled.** The U.S. says the offer is not enough [1][2].",
  "",
  "I can also give you a live update on the Strait of Hormuz.",
].join("\n");

describe("news answer layout", () => {
  it("keeps bold headlines and turns each line into a block", () => {
    const parsed = parseAiAnswer(news, context);
    assert.equal(hasBullets(parsed.parts), true);
    const blocks = answerBlocks(parsed.parts);
    assert.deepEqual(blocks.map((block) => block.kind), ["p", "li", "li", "p"]);
    const first = blocks[1];
    assert.ok(first && first.kind === "li");
    assert.deepEqual(first.parts[0], { text: "Tensions remain very high.", strong: true });
    assert.deepEqual(first.parts.at(-1), { cite: 1 });
    const intro = blocks[0];
    assert.ok(intro && intro.kind === "p");
    assert.deepEqual(intro.parts[1], { text: "October 2, 2026", strong: true });
    assert.equal(parsed.citations[0]?.site, "Reuters", "the publisher rides on the citation for its chip");
    assert.doesNotMatch(parsed.text, /\*\*/, "copied text has no markdown");
  });

  it("groups a run of citations into one chip", () => {
    const blocks = answerBlocks(parseAiAnswer(news, context).parts);
    const second = blocks[2];
    assert.ok(second && second.kind === "li");
    assert.deepEqual(groupCites(second.parts).at(-1), { cites: [1, 2] });
  });

  it("leaves plain and numbered answers alone", () => {
    assert.equal(hasBullets(parseAiAnswer("Paris is the capital [1].", context).parts), false);
    assert.equal(hasBullets(parseAiAnswer("Steps:\n1. Open it\n2. Save it", context).parts), false);
    assert.equal(hasBullets(parseAiAnswer("U.S.-Iran talks - a summary", context).parts), false);
  });

  it("keeps code blocks as their own block", () => {
    const blocks = answerBlocks(parseAiAnswer("Lists:\n- one\n\n```js\nconst a = [1];\n```", context).parts);
    assert.deepEqual(blocks.map((block) => block.kind), ["p", "li", "code"]);
  });
});
