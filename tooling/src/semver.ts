const numericIdentifier = "0|[1-9]\\d*";
const prereleaseIdentifier = `(?:${numericIdentifier}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
const semanticVersionPattern = new RegExp(
  `^(${numericIdentifier})\\.(${numericIdentifier})\\.(${numericIdentifier})(?:-(${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*))?$`,
);

interface SemanticVersion {
  core: [string, string, string];
  prerelease: string[];
}

/** Accept MAJOR.MINOR.PATCH with an optional -prerelease, as defined by SemVer 2.0.0 (no build metadata). */
export function isSemanticVersion(value: string): boolean {
  return semanticVersionPattern.test(value);
}

/** Order two semantic versions by SemVer 2.0.0 precedence, returning -1, 0, or 1. */
export function compareSemanticVersions(left: string, right: string): number {
  const leftVersion = parseSemanticVersion(left);
  const rightVersion = parseSemanticVersion(right);

  for (let index = 0; index < 3; index += 1) {
    const order = compareNumericIdentifiers(leftVersion.core[index], rightVersion.core[index]);
    if (order !== 0) return order;
  }

  // A release outranks its prereleases; otherwise compare identifiers until one list runs out.
  if (leftVersion.prerelease.length === 0 || rightVersion.prerelease.length === 0) {
    return Math.sign(rightVersion.prerelease.length - leftVersion.prerelease.length);
  }
  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    const order = comparePrereleaseIdentifiers(leftIdentifier, rightIdentifier);
    if (order !== 0) return order;
  }
  return 0;
}

function parseSemanticVersion(value: string): SemanticVersion {
  const match = semanticVersionPattern.exec(value);
  if (match === null) throw new Error(`Invalid semantic version "${value}".`);
  return {
    core: [match[1], match[2], match[3]],
    prerelease: match[4] === undefined ? [] : match[4].split("."),
  };
}

function comparePrereleaseIdentifiers(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return compareNumericIdentifiers(left, right);
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return compareStrings(left, right);
}

/** Compare digit strings without leading zeros exactly, however large they are. */
function compareNumericIdentifiers(left: string, right: string): number {
  return Math.sign(left.length - right.length) || compareStrings(left, right);
}

function compareStrings(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
