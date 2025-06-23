export default function duplicateName(name: string | null) {
  if (!name) {
    return '';
  }

  if (!/\((\d+)\)$/.test(name)) {
    return `${name}(1)`;
  }

  return name.replace(/\((\d+)\)$/, (_, num) => {
    const nextNum = parseInt(num) + 1;
    return `(${nextNum})`;
  });
}
