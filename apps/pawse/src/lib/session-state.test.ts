import {
  noteSessionAnswer,
  resetSessionAnswers,
  useSessionLost,
} from "./session-state";

const lost = () => useSessionLost.getState();

describe("session state", () => {
  beforeEach(resetSessionAnswers);

  it("calls the session lost only after repeated signed-out answers", () => {
    noteSessionAnswer(false);
    noteSessionAnswer(false);
    expect(lost()).toBe(false);
    noteSessionAnswer(false);
    expect(lost()).toBe(true);
  });

  it("recovers on a signed-in answer, and one in between starts the count over", () => {
    noteSessionAnswer(false);
    noteSessionAnswer(false);
    noteSessionAnswer(true);
    noteSessionAnswer(false);
    expect(lost()).toBe(false);
    noteSessionAnswer(false);
    noteSessionAnswer(false);
    expect(lost()).toBe(true);
    noteSessionAnswer(true);
    expect(lost()).toBe(false);
  });
});
