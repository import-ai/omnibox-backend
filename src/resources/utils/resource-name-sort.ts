import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourceSortOrder } from 'omniboxd/resources/resource-sort.types';

const zhCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', {
  sensitivity: 'base',
  numeric: true,
});

const baseCollator = new Intl.Collator('en-US', {
  sensitivity: 'base',
  numeric: true,
});

enum NameSortGroup {
  ENGLISH = 0,
  CHINESE = 1,
  NUMBER = 2,
  SYMBOL = 3,
}

export function sortResourcesByName(
  resources: Resource[],
  sortOrder: ResourceSortOrder,
): Resource[] {
  return [...resources].sort((left, right) => {
    const result = compareResourceNames(left, right);
    return sortOrder === ResourceSortOrder.ASC ? result : -result;
  });
}

function compareResourceNames(left: Resource, right: Resource): number {
  const leftName = normalizeName(left.name);
  const rightName = normalizeName(right.name);
  const leftGroup = getNameSortGroup(leftName);
  const rightGroup = getNameSortGroup(rightName);

  if (leftGroup !== rightGroup) {
    return leftGroup - rightGroup;
  }

  const nameCompare = compareNamesInGroup(leftName, rightName, leftGroup);
  if (nameCompare !== 0) {
    return nameCompare;
  }

  return left.id.localeCompare(right.id);
}

function normalizeName(name: string): string {
  return name.trim();
}

function compareNamesInGroup(
  leftName: string,
  rightName: string,
  group: NameSortGroup,
): number {
  if (group === NameSortGroup.CHINESE) {
    return zhCollator.compare(leftName, rightName);
  }

  if (group === NameSortGroup.NUMBER) {
    return compareLeadingNumbers(leftName, rightName);
  }

  if (group === NameSortGroup.SYMBOL) {
    return compareUnicode(leftName, rightName);
  }

  return baseCollator.compare(leftName, rightName);
}

function compareLeadingNumbers(leftName: string, rightName: string): number {
  const leftNumber = getLeadingNumberText(leftName);
  const rightNumber = getLeadingNumberText(rightName);

  if (leftNumber !== null && rightNumber !== null) {
    const numberCompare = compareUnicode(leftNumber, rightNumber);
    if (numberCompare !== 0) {
      return numberCompare;
    }
  }

  return baseCollator.compare(leftName, rightName);
}

function getLeadingNumberText(name: string): string | null {
  const match = name.match(/^\d+/);
  return match ? match[0] : null;
}

function getNameSortGroup(name: string): NameSortGroup {
  const firstChar = name[0] ?? '';

  if (/^[a-zA-Z]/.test(firstChar)) {
    return NameSortGroup.ENGLISH;
  }

  if (/^\p{Script=Han}$/u.test(firstChar)) {
    return NameSortGroup.CHINESE;
  }

  if (/^\d$/.test(firstChar)) {
    return NameSortGroup.NUMBER;
  }

  return NameSortGroup.SYMBOL;
}

function compareUnicode(leftName: string, rightName: string): number {
  const maxLength = Math.max(leftName.length, rightName.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftCodePoint = leftName.codePointAt(index);
    const rightCodePoint = rightName.codePointAt(index);

    if (leftCodePoint === undefined) {
      return -1;
    }
    if (rightCodePoint === undefined) {
      return 1;
    }
    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint - rightCodePoint;
    }
  }

  return 0;
}
