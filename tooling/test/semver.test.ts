import assert from "node:assert/strict";
import test from "node:test";
import { compareSemanticVersions, isSemanticVersion } from "../src/semver.js";

test("orders versions by SemVer precedence, including prerelease identifiers", () => {
  const ordered = [
    "0.9.0",
    "0.10.0",
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
    "1.0.1",
    "1.1.0",
    "2.0.0",
    "10.0.0",
  ];

  for (let index = 1; index < ordered.length; index += 1) {
    const lower = ordered[index - 1];
    const higher = ordered[index];
    assert.equal(compareSemanticVersions(lower, higher), -1, `${lower} < ${higher}`);
    assert.equal(compareSemanticVersions(higher, lower), 1, `${higher} > ${lower}`);
  }
  assert.equal(compareSemanticVersions("1.0.0-rc.1", "1.0.0-rc.1"), 0);
});

test("recognizes only MAJOR.MINOR.PATCH with an optional prerelease", () => {
  assert(isSemanticVersion("1.2.3"));
  assert(isSemanticVersion("1.2.3-rc.1"));
  assert(!isSemanticVersion("1.2"));
  assert(!isSemanticVersion("1.2.3+build"));
  assert(!isSemanticVersion("1.02.3"));
  assert.throws(() => compareSemanticVersions("1.2", "1.2.3"), /Invalid semantic version "1\.2"/);
});
