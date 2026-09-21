import { recordedSource } from "./source";

const events = recordedSource.events();
const expected = ["initialize", "deposit", "borrow", "accrue", "repay", "redeem"];
const actual = events.map((event) => event.kind);
if (actual.join(",") !== expected.join(",")) {
  throw new Error(`lifecycle order changed: ${actual.join(" -> ")}`);
}

if (new Set(events.map((event) => event.signature)).size !== events.length) {
  throw new Error("replay contains a duplicate transaction signature");
}
for (let index = 1; index < events.length; index++) {
  if (events[index].slot <= events[index - 1].slot) {
    throw new Error(`slots are not increasing at event ${events[index].seq}`);
  }
  if (events[index].exchangeRate < events[index - 1].exchangeRate) {
    throw new Error(`exchange rate fell at event ${events[index].seq}`);
  }
}

const deposit = events.find((event) => event.kind === "deposit")!;
const redeem = events.find((event) => event.kind === "redeem")!;
if (!deposit.equityAmount || !redeem.equityAmount || redeem.equityAmount <= deposit.equityAmount) {
  throw new Error("recorded redemption does not return more SPYx than the deposit");
}

console.log(`selfcheck PASS: ${events.length} ordered Cairn lifecycle events`);
